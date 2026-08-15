import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createWebsite, listWebsitesForOrganization } from "@/lib/db/websites";
import { getOrganization } from "@/lib/db/organizations";
import { jsonError, jsonZodError, withErrorHandling } from "@/lib/api/respond";

const createSchema = z.object({
  name: z.string().min(1).max(200),
  base_url: z.string().url(),
  crawl_max_pages: z.number().int().min(1).max(500).optional(),
  crawl_max_depth: z.number().int().min(0).max(10).optional(),
});

export const GET = withErrorHandling(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const websites = await listWebsitesForOrganization(id);
  return NextResponse.json({ websites });
});

export const POST = withErrorHandling(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const organization = await getOrganization(id);
  if (!organization) return jsonError("Organization not found", 404);

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return jsonZodError(parsed.error);

  const website = await createWebsite({ organization_id: id, ...parsed.data });
  return NextResponse.json({ website }, { status: 201 });
});
