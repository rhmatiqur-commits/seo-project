import { NextResponse, type NextRequest } from "next/server";
import { listIssuesForWebsite } from "@/lib/db/audits";
import { withErrorHandling } from "@/lib/api/respond";

export const GET = withErrorHandling(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const issues = await listIssuesForWebsite(id);
  return NextResponse.json({ issues });
});
