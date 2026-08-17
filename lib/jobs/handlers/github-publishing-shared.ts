import { updatePublicationStatus } from "@/lib/db/content-publications";
import { recordPublicationAuditEvent } from "@/lib/db/publication-audit";
import { GitHubApiError } from "@/lib/publishing/github/errors";
import { PermanentJobError } from "@/lib/jobs/types";
import type { PublishingContext } from "@/lib/jobs/handlers/publishing-shared";
import type { GitHubPublicationRaw } from "@/lib/publishing/github/provider";
import type { PublishPageInput } from "@/lib/publishing/provider";
import type { ContentMetadata } from "@/lib/content/provider";
import type { PublicationStatus } from "@/lib/supabase/types";

/**
 * Shared by lib/jobs/handlers/create-draft.ts's GitHub branch and (in the
 * future) any other GitHub-flow entry point — builds the structured
 * PublishPageInput.git block a git-based provider requires, and normalises
 * error handling/audit-logging the same way create-draft.ts's WordPress
 * path already does, so the two paths stay observably consistent even
 * though their underlying operations differ completely.
 */
export function buildGitHubPublishInput(ctx: PublishingContext): PublishPageInput {
  const metadata = ctx.version.metadata as unknown as ContentMetadata;
  return {
    title: metadata.seoTitle || ctx.version.title || ctx.brief.primary_keyword || "Untitled",
    bodyHtml: "", // unused by GitHubPublishingProvider — see input.git.bodyMarkdown instead
    excerpt: metadata.metaDescription ?? null,
    slug: ctx.slug,
    status: "draft",
    git: {
      contentVersionId: ctx.version.id,
      contentType: ctx.brief.content_type as "CREATE_NEW_PAGE" | "OPTIMISE_EXISTING_PAGE",
      targetUrl: ctx.targetUrl,
      bodyMarkdown: ctx.version.content,
      h1: metadata.h1 ?? null,
      // The one piece of idempotency state the provider needs from us — see
      // lib/publishing/github/provider.ts's createDraft, which reuses this
      // branch instead of deriving/creating a new one when it's present.
      knownBranchName: ctx.publication.branch_name,
    },
  };
}

/** Maps a GitHubPublicationRaw snapshot onto content_publications' dedicated
 * columns — the one place that mapping happens, so create-draft.ts and a
 * future revision entry point can't drift on which field goes where. */
export function githubRawToPublicationPatch(raw: GitHubPublicationRaw) {
  return {
    externalId: raw.pullRequestNumber ? String(raw.pullRequestNumber) : null,
    branchName: raw.branchName,
    baseCommitSha: raw.baseCommitSha,
    commitSha: raw.commitSha,
    pullRequestNumber: raw.pullRequestNumber,
    pullRequestUrl: raw.pullRequestUrl,
    previewUrl: raw.previewUrl,
    providerResponseMetadata: raw as unknown as Record<string, unknown>,
  };
}

/** BRANCH_CREATED (no PR — GITHUB_BRANCH_ONLY mode) vs PR_CREATED, followed
 * by PREVIEW_READY once a Vercel preview URL has actually been detected —
 * spec section "PUBLICATION STATES", applied deterministically from what
 * the provider actually returned rather than assumed from the mode alone
 * (a PR can exist before Vercel has posted a preview status yet). */
export function nextGitHubDraftStatus(raw: GitHubPublicationRaw): PublicationStatus {
  if (raw.previewUrl) return "PREVIEW_READY";
  if (raw.pullRequestNumber) return "PR_CREATED";
  return raw.commitSha ? "COMMITTED" : "BRANCH_CREATED";
}

/** Re-throws a retryable GitHubApiError as-is (the generic job-retry policy
 * handles it) or wraps a permanent one in PermanentJobError — same
 * kind/retryable-driven classification create-draft.ts's WordPress branch
 * already applies via WordPressApiError. */
export function classifyGitHubJobError(error: unknown): never {
  if (error instanceof GitHubApiError && !error.retryable) throw new PermanentJobError(error.message);
  throw error;
}

export async function recordGitHubFailure(ctx: PublishingContext, action: string, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  await updatePublicationStatus(ctx.publication.id, "FAILED", { error: message });
  await recordPublicationAuditEvent({
    organizationId: ctx.publication.organization_id,
    websiteId: ctx.publication.website_id,
    contentPublicationId: ctx.publication.id,
    contentVersionId: ctx.version.id,
    action,
    result: "failure",
    failureReason: message,
  });
}
