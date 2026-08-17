import { loadAndValidatePublishingContext } from "@/lib/jobs/handlers/publishing-shared";
import { updatePublicationStatus } from "@/lib/db/content-publications";
import { recordPublicationAuditEvent } from "@/lib/db/publication-audit";
import { decidePublishAction } from "@/lib/publishing/retry-strategy";
import { markdownToHtml } from "@/lib/publishing/markdown";
import { WordPressApiError } from "@/lib/publishing/errors";
import { PermanentJobError } from "@/lib/jobs/types";
import { buildGitHubPublishInput, githubRawToPublicationPatch, nextGitHubDraftStatus, classifyGitHubJobError, recordGitHubFailure } from "@/lib/jobs/handlers/github-publishing-shared";
import type { GitHubPublicationRaw } from "@/lib/publishing/github/provider";
import type { PublishingContext } from "@/lib/jobs/handlers/publishing-shared";
import type { PublishPageInput } from "@/lib/publishing/provider";
import type { ContentMetadata } from "@/lib/content/provider";
import type { JobHandler } from "@/lib/jobs/types";

/**
 * The GitHub branch of CREATE_DRAFT (spec: "map createDraft onto branch
 * creation, file creation, commit, pull request" — never a merge). Kept as
 * a separate function, called before any WordPress-specific code below
 * runs, so the WordPress path is untouched by this phase — see
 * lib/publishing/github/provider.ts for the actual branch/commit/PR
 * orchestration and its own idempotency handling (this function is a thin
 * status/audit wrapper around one provider.createDraft() call, mirroring
 * the WordPress branch's own shape).
 */
async function handleCreateGitHubDraft(ctx: PublishingContext): Promise<Record<string, unknown>> {
  await updatePublicationStatus(ctx.publication.id, "PUBLISHING");
  try {
    const input = buildGitHubPublishInput(ctx);
    const result = await ctx.provider.createDraft(input);
    const raw = result.raw as unknown as GitHubPublicationRaw;
    const patch = githubRawToPublicationPatch(raw);

    await updatePublicationStatus(ctx.publication.id, nextGitHubDraftStatus(raw), { ...patch, error: null });
    await recordPublicationAuditEvent({
      organizationId: ctx.publication.organization_id,
      websiteId: ctx.publication.website_id,
      contentPublicationId: ctx.publication.id,
      contentVersionId: ctx.version.id,
      action: raw.pullRequestNumber ? "PR_CREATED" : "BRANCH_CREATED",
      targetUrl: raw.pullRequestUrl ?? undefined,
      result: "success",
    });

    return { contentPublicationId: ctx.publication.id, branchName: raw.branchName, pullRequestNumber: raw.pullRequestNumber, pullRequestUrl: raw.pullRequestUrl, previewUrl: raw.previewUrl };
  } catch (error) {
    await recordGitHubFailure(ctx, "DRAFT_CREATE_FAILED", error);
    classifyGitHubJobError(error);
  }
}

/**
 * CREATE_DRAFT: publishes APPROVED content to the connected CMS as a draft
 * — never publicly visible (lib/publishing/wordpress-provider.ts's
 * createDraft() forces status='draft' regardless of any input, as a second
 * layer of defence beyond this handler only ever calling it with 'draft').
 * On a retry, checks for an already-created page (by known external_id, or
 * by slug lookup) before ever creating a second one — see
 * lib/publishing/retry-strategy.ts.
 *
 * For a GitHub connection, "draft" means branch + commit + pull request —
 * never merged, never live — delegated to handleCreateGitHubDraft above.
 * Everything below this point is WordPress-only, unchanged from Phase 5.
 */
export const handleCreateDraft: JobHandler = async ({ job }) => {
  const payload = job.payload as { content_publication_id?: string } | null;
  const ctx = await loadAndValidatePublishingContext(payload ?? {});

  if (ctx.connection.provider === "github") {
    return handleCreateGitHubDraft(ctx);
  }

  await updatePublicationStatus(ctx.publication.id, "PUBLISHING");

  try {
    let foundBySlug: { externalId: string } | null = null;
    if (!ctx.publication.external_id && job.retry_count > 0) {
      const found = await ctx.provider.findBySlug(ctx.slug);
      foundBySlug = found ? { externalId: found.externalId } : null;
    }
    const action = decidePublishAction({ existingExternalId: ctx.publication.external_id, retryCount: job.retry_count, foundExistingBySlug: foundBySlug });

    const metadata = ctx.version.metadata as unknown as ContentMetadata;
    const input: PublishPageInput = {
      title: metadata.seoTitle || ctx.version.title || ctx.brief.primary_keyword || "Untitled",
      bodyHtml: markdownToHtml(ctx.version.content),
      excerpt: metadata.metaDescription ?? null,
      slug: ctx.slug,
      status: "draft",
    };

    const result =
      action === "USE_EXISTING"
        ? await ctx.provider.update(ctx.publication.external_id!, input)
        : action === "ADOPT_FOUND"
          ? await ctx.provider.update(foundBySlug!.externalId, input)
          : await ctx.provider.createDraft(input);

    await updatePublicationStatus(ctx.publication.id, "DRAFTED", {
      externalId: result.externalId,
      targetUrl: result.url,
      providerResponseMetadata: result.raw,
      error: null,
    });
    await recordPublicationAuditEvent({
      organizationId: ctx.publication.organization_id,
      websiteId: ctx.publication.website_id,
      contentPublicationId: ctx.publication.id,
      contentVersionId: ctx.version.id,
      action: "DRAFT_CREATED",
      targetUrl: result.url,
      result: "success",
    });

    return { contentPublicationId: ctx.publication.id, externalId: result.externalId, url: result.url, action };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updatePublicationStatus(ctx.publication.id, "FAILED", { error: message });
    await recordPublicationAuditEvent({
      organizationId: ctx.publication.organization_id,
      websiteId: ctx.publication.website_id,
      contentPublicationId: ctx.publication.id,
      contentVersionId: ctx.version.id,
      action: "DRAFT_CREATE_FAILED",
      result: "failure",
      failureReason: message,
    });
    if (error instanceof WordPressApiError && !error.retryable) throw new PermanentJobError(message);
    throw error;
  }
};
