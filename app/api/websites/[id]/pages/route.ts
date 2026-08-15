import { NextResponse, type NextRequest } from "next/server";
import { listPagesForWebsite } from "@/lib/db/pages";
import { withErrorHandling } from "@/lib/api/respond";

export const GET = withErrorHandling(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const pages = await listPagesForWebsite(id);
  return NextResponse.json({ pages });
});
