import { NextResponse, type NextRequest } from "next/server";
import { listTasksForWebsite } from "@/lib/db/tasks";
import { withErrorHandling } from "@/lib/api/respond";

export const GET = withErrorHandling(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const tasks = await listTasksForWebsite(id);
  return NextResponse.json({ tasks });
});
