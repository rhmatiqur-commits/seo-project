import { NextResponse, type NextRequest } from "next/server";
import { getContentVersionById, getContentBrief, getContentJob } from "@/lib/db/content";
import { getOrCreatePublicationForVersion } from "@/lib/db/content-publications";
import { isContentApprovedForPublication } from "@/lib/publishing/eligibility";
import { triggerJob } from "@/lib/jobs/trigger";
import { jsonError, withErrorHandling } from "@/lib/api/respond";

/**
 * Manual trigger, mirrors app/api/content-briefs/[id]/generate/route.ts
 * exactly — organization_id/website_id are always derived server-side from
 * the content_versions row itself. APPROVED status is re-checked here too
 * (never trusted from the caller) — the job handler re-checks it again
 * regardless, this is just a fast, clear rejection before a job is even queued.
 */
export const POST = withErrorHandling(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const version = await getContentVersionById(id);
  if (!version) return jsonError("Content version not found", 404);

  const contentJob = await getContentJob(version.content_job_id);
  if (!contentJob || !isContentApprovedForPublication(contentJob.status)) {
    return jsonError(`Content is not APPROVED (status: ${contentJob?.status ?? "unknown"}) — cannot publish.`, 403);
  }

  const brief = await getContentBrief(version.content_brief_id);
  if (!brief) return jsonError("Content brief not found", 404);

  const publication = await getOrCreatePublicationForVersion({
    organizationId: version.organization_id,
    websiteId: version.website_id,
    contentVersionId: version.id,
    publicationType: brief.content_type as "CREATE_NEW_PAGE" | "OPTIMISE_EXISTING_PAGE",
    targetUrl: brief.target_url,
  });

  const { jobId, created } = await triggerJob({
    organizationId: version.organization_id,
    websiteId: version.website_id,
    jobType: "PUBLISH_CONTENT",
    payload: { content_publication_id: publication.id },
    idempotencyKey: `PUBLISH_CONTENT:${version.id}`,
  });

  return NextResponse.json({ jobId, created, contentPublicationId: publication.id }, { status: created ? 202 : 200 });
});
