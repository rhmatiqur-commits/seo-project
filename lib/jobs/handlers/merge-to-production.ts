import { loadAndValidatePublishingContext } from "@/lib/jobs/handlers/publishing-shared";
import { updatePublicationStatus } from "@/lib/db/content-publications";
import { recordPublicationAuditEvent } from "@/lib/db/publication-audit";
import { buildGitHubPublishInput, recordGitHubFailure, classifyGitHubJobError } from "@/lib/jobs/handlers/github-publishing-shared";
import { recordSeoActionForPublication } from "@/lib/jobs/handlers/record-seo-action";
import { PermanentJobError } from "@/lib/jobs/types";
import type { GitHubPublicationRaw } from "@/lib/publishing/github/provider";
import type { JobHandler } from "@/lib/jobs/types";

/**
 * MERGE_TO_PRODUCTION (Phase 6A) — the explicit, human-triggered operation
 * that merges an already-open pull request into a GitHub-connected
 * website's production branch. Deliberately a distinct job type from
 * PUBLISH_CONTENT (WordPress's "flip draft to published", untouched by this
 * phase) — "Production merge must require explicit user action initially"
 * and must never happen as a side effect of CREATE_DRAFT/preparing a
 * publication, regardless of the connection's configured publication_mode.
 *
 * Every check loadAndValidatePublishingContext already performs (content
 * APPROVED, website/organization ownership, connection active) is re-run
 * here from the database on every attempt, same as every other publishing
 * job — plus this handler's own GitHub-specific checks: a pull request must
 * already exist, and lib/publishing/github/provider.ts's own merge() call
 * re-validates branch/PR existence and mergeability against live GitHub
 * state (via lib/publishing/github/retry-strategy.ts's decideMergeAction)
 * before ever attempting the merge — nothing here trusts a status the
 * browser or an earlier job run reported.
 */
export const handleMergeToProduction: JobHandler = async ({ job }) => {
  const payload = job.payload as { content_publication_id?: string } | null;
  const ctx = await loadAndValidatePublishingContext(payload ?? {});

  if (ctx.connection.provider !== "github") {
    throw new PermanentJobError(`MERGE_TO_PRODUCTION only applies to GitHub-connected websites (this website's connection is "${ctx.connection.provider}") — use PUBLISH_CONTENT instead.`);
  }
  if (!ctx.publication.pull_request_number) {
    throw new PermanentJobError("No pull request exists for this publication yet — run CREATE_DRAFT (branch + commit + PR) before merging to production.");
  }

  await updatePublicationStatus(ctx.publication.id, "MERGING");

  try {
    const input = buildGitHubPublishInput(ctx);
    const result = await ctx.provider.publish(input, String(ctx.publication.pull_request_number));
    const raw = result.raw as unknown as GitHubPublicationRaw;

    await updatePublicationStatus(ctx.publication.id, "PUBLISHED", {
      externalId: result.externalId,
      // The platform's own resolved URL (content_briefs.target_url, already
      // an absolute URL — see lib/content/build-brief.ts's suggestUrlSlug),
      // never a value the provider invents — same "never trust a
      // provider-returned URL for an existing page" caution
      // lib/publishing/url.ts already applies to WordPress.
      targetUrl: ctx.targetUrl,
      publishedAt: new Date().toISOString(),
      productionCommitSha: raw.productionCommitSha,
      providerResponseMetadata: raw as unknown as Record<string, unknown>,
      error: null,
    });
    await recordPublicationAuditEvent({
      organizationId: ctx.publication.organization_id,
      websiteId: ctx.publication.website_id,
      contentPublicationId: ctx.publication.id,
      contentVersionId: ctx.version.id,
      action: "MERGED_TO_PRODUCTION",
      targetUrl: ctx.targetUrl,
      result: "success",
    });

    // Phase 6 integration: this is the moment a GitHub-based action becomes
    // measurable, exactly mirroring publish-content.ts's WordPress hook —
    // reuses the same function, since content_publications/seo_actions are
    // already provider-agnostic (no separate analytics flow, per spec).
    await recordSeoActionForPublication(ctx, ctx.targetUrl).catch((error) => {
      console.warn(`[jobs] failed to record seo_action for content_publication ${ctx.publication.id}, continuing:`, error);
    });

    return { contentPublicationId: ctx.publication.id, url: ctx.targetUrl, productionCommitSha: raw.productionCommitSha };
  } catch (error) {
    await recordGitHubFailure(ctx, "MERGE_FAILED", error);
    classifyGitHubJobError(error);
  }
};
