import { NextResponse, type NextRequest } from "next/server";
import { getWebsite } from "@/lib/db/websites";
import { triggerJob } from "@/lib/jobs/trigger";
import { jsonError, withErrorHandling } from "@/lib/api/respond";

/** Manual ANALYSE_ACTION_OUTCOMES trigger (Phase 6) — mirrors the
 * search-performance-analysis route exactly. Gated by the same Basic Auth
 * proxy.ts already applies to every /api/** route; organization_id is always
 * derived from the website row, never trusted from the request. */
export const POST = withErrorHandling(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const website = await getWebsite(id);
  if (!website) return jsonError("Website not found", 404);

  const { jobId, created } = await triggerJob({
    organizationId: website.organization_id,
    websiteId: website.id,
    jobType: "ANALYSE_ACTION_OUTCOMES",
    idempotencyKey: `ANALYSE_ACTION_OUTCOMES:${website.id}`,
  });

  return NextResponse.json({ jobId, created }, { status: created ? 202 : 200 });
});
