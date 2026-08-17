import { loadAndValidatePublishingContext } from "@/lib/jobs/handlers/publishing-shared";
import { updatePublicationStatus } from "@/lib/db/content-publications";
import { recordPublicationAuditEvent } from "@/lib/db/publication-audit";
import { decidePublishAction } from "@/lib/publishing/retry-strategy";
import { markdownToHtml } from "@/lib/publishing/markdown";
import { WordPressApiError } from "@/lib/publishing/errors";
import { PermanentJobError } from "@/lib/jobs/types";
import { recordSeoActionForPublication } from "@/lib/jobs/handlers/record-seo-action";
import type { PublishPageInput } from "@/lib/publishing/provider";
import type { ContentMetadata } from "@/lib/content/provider";
import type { JobHandler } from "@/lib/jobs/types";

/**
 * PUBLISH_CONTENT: the only path that ever makes content publicly visible —
 * every check in lib/jobs/handlers/publishing-shared.ts (content APPROVED,
 * website ownership, CMS connection active) is re-verified here, server
 * side, on every attempt, regardless of what the admin UI showed a moment
 * ago. If a CREATE_DRAFT already produced an external_id for this same
 * content_publications row, that exact page is flipped from draft to
 * published (never a second page created) — see
 * lib/publishing/wordpress-provider.ts's publish().
 */
export const handlePublishContent: JobHandler = async ({ job }) => {
  const payload = job.payload as { content_publication_id?: string } | null;
  const ctx = await loadAndValidatePublishingContext(payload ?? {});

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
      status: "publish",
    };

    const existingExternalId = action === "USE_EXISTING" ? ctx.publication.external_id : action === "ADOPT_FOUND" ? foundBySlug!.externalId : null;
    const result = await ctx.provider.publish(input, existingExternalId);

    await updatePublicationStatus(ctx.publication.id, "PUBLISHED", {
      externalId: result.externalId,
      targetUrl: result.url,
      publishedAt: new Date().toISOString(),
      providerResponseMetadata: result.raw,
      error: null,
    });
    await recordPublicationAuditEvent({
      organizationId: ctx.publication.organization_id,
      websiteId: ctx.publication.website_id,
      contentPublicationId: ctx.publication.id,
      contentVersionId: ctx.version.id,
      action: "PUBLISHED",
      targetUrl: result.url,
      result: "success",
    });

    // Phase 6: this is the moment a content action becomes measurable —
    // closes the loop SEO ACTION -> PUBLICATION -> ... -> SEARCH CONSOLE.
    // Soft-failed: a seo_actions bookkeeping problem must never undo an
    // already-successful publish (same "additive, never blocking" posture
    // as the AI-interpretation passes elsewhere in this codebase).
    await recordSeoActionForPublication(ctx, result.url).catch((error) => {
      console.warn(`[jobs] failed to record seo_action for content_publication ${ctx.publication.id}, continuing:`, error);
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
      action: "PUBLISH_FAILED",
      result: "failure",
      failureReason: message,
    });
    if (error instanceof WordPressApiError && !error.retryable) throw new PermanentJobError(message);
    throw error;
  }
};
