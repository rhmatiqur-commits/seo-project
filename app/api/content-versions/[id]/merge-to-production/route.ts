import { NextResponse, type NextRequest } from "next/server";
import { getContentVersionById, getContentBrief, getContentJob } from "@/lib/db/content";
import { getOrCreatePublicationForVersion } from "@/lib/db/content-publications";
import { getCmsConnectionForWebsite } from "@/lib/db/cms-connections";
import { isContentApprovedForPublication } from "@/lib/publishing/eligibility";
import { triggerJob } from "@/lib/jobs/trigger";
import { jsonError, withErrorHandling } from "@/lib/api/respond";

/**
 * Manual MERGE_TO_PRODUCTION trigger (Phase 6A) — mirrors
 * app/api/content-versions/[id]/publish/route.ts exactly, including its
 * server-side re-derivation of organization_id/website_id from the content
 * version row and its own re-check of APPROVED status (the job handler
 * re-checks everything again regardless — this is a fast, clear rejection
 * before a job is even queued, same defence-in-depth reasoning). Only
 * meaningful for a GitHub-connected website; the job handler itself is the
 * authority on that (lib/jobs/handlers/merge-to-production.ts throws a
 * PermanentJobError for any other provider), but this route gives a
 * clearer 403 up front rather than letting a WordPress caller queue a job
 * that's guaranteed to fail.
 */
export const POST = withErrorHandling(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const version = await getContentVersionById(id);
  if (!version) return jsonError("Content version not found", 404);

  const contentJob = await getContentJob(version.content_job_id);
  if (!contentJob || !isContentApprovedForPublication(contentJob.status)) {
    return jsonError(`Content is not APPROVED (status: ${contentJob?.status ?? "unknown"}) — cannot merge to production.`, 403);
  }

  const brief = await getContentBrief(version.content_brief_id);
  if (!brief) return jsonError("Content brief not found", 404);

  const connection = await getCmsConnectionForWebsite(version.website_id);
  if (!connection || connection.provider !== "github") {
    return jsonError("MERGE_TO_PRODUCTION only applies to a GitHub-connected website — use the publish endpoint instead.", 400);
  }

  const publication = await getOrCreatePublicationForVersion({
    organizationId: version.organization_id,
    websiteId: version.website_id,
    contentVersionId: version.id,
    publicationType: brief.content_type as "CREATE_NEW_PAGE" | "OPTIMISE_EXISTING_PAGE",
    targetUrl: brief.target_url,
  });
  if (!publication.pull_request_number) {
    return jsonError("No pull request exists for this publication yet — create a draft (branch + commit + PR) first.", 400);
  }

  const { jobId, created } = await triggerJob({
    organizationId: version.organization_id,
    websiteId: version.website_id,
    jobType: "MERGE_TO_PRODUCTION",
    payload: { content_publication_id: publication.id },
    idempotencyKey: `MERGE_TO_PRODUCTION:${version.id}`,
  });

  return NextResponse.json({ jobId, created, contentPublicationId: publication.id }, { status: created ? 202 : 200 });
});
