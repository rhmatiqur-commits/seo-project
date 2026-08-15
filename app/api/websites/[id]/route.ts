import { NextResponse, type NextRequest } from "next/server";
import { getWebsite } from "@/lib/db/websites";
import { jsonError, withErrorHandling } from "@/lib/api/respond";

export const GET = withErrorHandling(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const website = await getWebsite(id);
  if (!website) return jsonError("Website not found", 404);
  return NextResponse.json({ website });
});
