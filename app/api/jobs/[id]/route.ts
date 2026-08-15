import { NextResponse, type NextRequest } from "next/server";
import { getJob } from "@/lib/db/jobs";
import { jsonError, withErrorHandling } from "@/lib/api/respond";

export const GET = withErrorHandling(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) return jsonError("Job not found", 404);
  return NextResponse.json({ job });
});
