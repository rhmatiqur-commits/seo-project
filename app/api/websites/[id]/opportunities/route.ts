import { NextResponse, type NextRequest } from "next/server";
import { getWebsite } from "@/lib/db/websites";
import { listOpportunitiesForWebsite } from "@/lib/db/opportunities";
import { triggerJob } from "@/lib/jobs/trigger";
import { jsonError, withErrorHandling } from "@/lib/api/respond";

export const GET = withErrorHandling(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const opportunities = await listOpportunitiesForWebsite(id);
  return NextResponse.json({ opportunities });
});

export const POST = withErrorHandling(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const website = await getWebsite(id);
  if (!website) return jsonError("Website not found", 404);

  const { jobId, created } = await triggerJob({
    organizationId: website.organization_id,
    websiteId: website.id,
    jobType: "GENERATE_SEO_OPPORTUNITIES",
    idempotencyKey: `GENERATE_SEO_OPPORTUNITIES:${website.id}`,
  });

  return NextResponse.json({ jobId, created }, { status: created ? 202 : 200 });
});
