import { loadAndValidatePublishingContext } from "@/lib/jobs/handlers/publishing-shared";
import { updatePublicationStatus } from "@/lib/db/content-publications";
import { recordPublicationAuditEvent } from "@/lib/db/publication-audit";
import { decidePublishAction } from "@/lib/publishing/retry-strategy";
import { markdownToHtml } from "@/lib/publishing/markdown";
import { WordPressApiError } from "@/lib/publishing/errors";
import { PermanentJobError } from "@/lib/jobs/types";
import type { PublishPageInput } from "@/lib/publishing/provider";
import type { ContentMetadata } from "@/lib/content/provider";
import type { JobHandler } from "@/lib/jobs/types";

/**
 * CREATE_DRAFT: publishes APPROVED content to the connected CMS as a draft
 * — never publicly visible (lib/publishing/wordpress-provider.ts's
 * createDraft() forces status='draft' regardless of any input, as a second
 * layer of defence beyond this handler only ever calling it with 'draft').
 * On a retry, checks for an already-created page (by known external_id, or
 * by slug lookup) before ever creating a second one — see
 * lib/publishing/retry-strategy.ts.
 */
export const handleCreateDraft: JobHandler = async ({ job }) => {
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
