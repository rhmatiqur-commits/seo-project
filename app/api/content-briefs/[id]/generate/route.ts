import { NextResponse, type NextRequest } from "next/server";
import { getContentBrief, findActiveContentJobForBrief, insertContentJob } from "@/lib/db/content";
import { getContentProvider } from "@/lib/content/get-provider";
import { triggerJob } from "@/lib/jobs/trigger";
import { jsonError, withErrorHandling } from "@/lib/api/respond";

/** Manual trigger, mirrors app/api/websites/[id]/serp-fetch/route.ts exactly
 * — organization_id/website_id are always derived server-side from the
 * content_briefs row itself, never trusted from the request. */
export const POST = withErrorHandling(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const brief = await getContentBrief(id);
  if (!brief) return jsonError("Content brief not found", 404);

  const active = await findActiveContentJobForBrief(id);
  const contentJob =
    active ?? (await insertContentJob({ organizationId: brief.organization_id, websiteId: brief.website_id, contentBriefId: brief.id, provider: getContentProvider().name }));

  const { jobId, created } = await triggerJob({
    organizationId: brief.organization_id,
    websiteId: brief.website_id,
    jobType: "GENERATE_CONTENT",
    payload: { content_job_id: contentJob.id },
    idempotencyKey: `GENERATE_CONTENT:${contentJob.id}`,
  });

  return NextResponse.json({ jobId, created, contentJobId: contentJob.id }, { status: created ? 202 : 200 });
});
