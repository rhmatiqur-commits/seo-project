import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createOrganization, listOrganizations } from "@/lib/db/organizations";
import { jsonZodError, withErrorHandling } from "@/lib/api/respond";

const createSchema = z.object({ name: z.string().min(1).max(200) });

export const GET = withErrorHandling(async () => {
  const organizations = await listOrganizations();
  return NextResponse.json({ organizations });
});

export const POST = withErrorHandling(async (req: NextRequest) => {
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return jsonZodError(parsed.error);

  const organization = await createOrganization(parsed.data.name);
  return NextResponse.json({ organization }, { status: 201 });
});
