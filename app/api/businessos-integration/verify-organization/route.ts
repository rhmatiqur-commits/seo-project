import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { getOrganization } from "@/lib/db/organizations";
import { isAuthorizedBearer } from "@/lib/api/businessos-auth";
import { isRateLimited } from "@/lib/api/rate-limit";
import { jsonError, jsonZodError, withErrorHandling } from "@/lib/api/respond";

/**
 * Phase 3D: lets the BusinessOS platform confirm an organisation id
 * actually resolves to a real organisation here, and what it's called,
 * before its admin saves a link to it -- see that repository's
 * docs/architecture.md "Growth module (SEO)" section for the full
 * rationale and the exact confirmation UI this powers.
 *
 * Returns ONLY name + slug. No operational data, no metrics, no Search
 * Console data, no customer data -- this is an identity-confirmation
 * endpoint, not a data API, and must never grow into one.
 */

const requestSchema = z.object({
  organizationId: z.string().uuid(),
});

async function handle(req: NextRequest): Promise<Response> {
  if (!isAuthorizedBearer(req.headers.get("authorization"), env.BUSINESSOS_INTEGRATION_SECRET)) return jsonError("Unauthorized", 401);
  if (isRateLimited("businessos-integration")) return jsonError("Rate limited", 429);

  const body = await req.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return jsonZodError(parsed.error);

  const organization = await getOrganization(parsed.data.organizationId);
  // Same response whether the id doesn't exist at all or exists but isn't
  // allowlisted for this integration (organizations.businessos_integration_enabled,
  // migration 0029) -- a stolen BUSINESSOS_INTEGRATION_SECRET must not be
  // able to tell those two cases apart, or probe which organisation ids
  // are real. That flag is trusted-admin-controlled only; nothing in this
  // route (or the invitations route) ever sets it.
  if (!organization || !organization.businessos_integration_enabled) return jsonError("Organisation not found", 404);

  return NextResponse.json({
    organizationId: organization.id,
    name: organization.name,
    slug: organization.slug,
  });
}

export const POST = withErrorHandling(handle);
