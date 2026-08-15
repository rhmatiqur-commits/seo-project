import { NextResponse, type NextRequest } from "next/server";
import { getWebsite } from "@/lib/db/websites";
import { getSearchConsoleConnection } from "@/lib/db/search-console";
import { triggerJob } from "@/lib/jobs/trigger";
import { jsonError, withErrorHandling } from "@/lib/api/respond";

export const POST = withErrorHandling(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const website = await getWebsite(id);
  if (!website) return jsonError("Website not found", 404);

  const connection = await getSearchConsoleConnection(website.id);
  if (!connection || connection.status !== "active" || !connection.site_url) {
    return jsonError("Website has no active Search Console connection. Connect and select a property first.", 409);
  }

  const { jobId, created } = await triggerJob({
    organizationId: website.organization_id,
    websiteId: website.id,
    jobType: "SEARCH_CONSOLE_SYNC",
    idempotencyKey: `SEARCH_CONSOLE_SYNC:${website.id}`,
  });

  return NextResponse.json({ jobId, created }, { status: created ? 202 : 200 });
});
