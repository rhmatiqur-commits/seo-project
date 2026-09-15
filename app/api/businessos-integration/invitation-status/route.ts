import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { getOrganization } from "@/lib/db/organizations";
import { getInvitationById } from "@/lib/db/invitations";
import { resolveInvitationStatus } from "@/lib/api/businessos-invitation-status";
import { isAuthorizedBearer } from "@/lib/api/businessos-auth";
import { isRateLimited } from "@/lib/api/rate-limit";
import { jsonError, jsonZodError, withErrorHandling } from "@/lib/api/respond";

/**
 * Phase 3F: lets the BusinessOS platform poll the current lifecycle state
 * of exactly one invitation it already knows about (its own id, generated
 * by a prior POST /api/businessos-integration/invitations call) -- never a
 * general listing. Read-only: this route never writes to
 * organization_invitations or memberships. See that platform's own
 * docs/architecture.md "Growth module (SEO)" section for the full
 * cross-product rationale and the poller that calls this on a schedule.
 *
 * Returns ONLY { status }. No email, no membership id, no organisation
 * data beyond confirming the claimed pairing is valid -- this is a status
 * check, not a data API, and must never grow into one.
 */

const requestSchema = z.object({
  organizationId: z.string().uuid(),
  invitationId: z.string().uuid(),
});

async function handle(req: NextRequest): Promise<Response> {
  if (!isAuthorizedBearer(req.headers.get("authorization"), env.BUSINESSOS_INTEGRATION_SECRET)) return jsonError("Unauthorized", 401);
  if (isRateLimited("businessos-integration")) return jsonError("Rate limited", 429);

  const body = await req.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return jsonZodError(parsed.error);

  const { organizationId, invitationId } = parsed.data;

  const organization = await getOrganization(organizationId);
  // Same allowlist gate as the other two businessos-integration routes --
  // see verify-organization/route.ts for the full rationale. A stolen
  // BUSINESSOS_INTEGRATION_SECRET must not be able to poll the status of
  // an invitation belonging to an organisation that was never allowlisted.
  if (!organization || !organization.businessos_integration_enabled) return jsonError("Organisation not found", 404);

  const invitation = await getInvitationById(invitationId);
  const resolved = resolveInvitationStatus(invitation, organizationId);
  // Same generic 404 whether the invitation doesn't exist or belongs to a
  // different organisation than claimed -- never distinguishable, per
  // this codebase's established minimum-disclosure convention.
  if (!resolved.ok) return jsonError("Organisation not found", 404);

  return NextResponse.json({ status: resolved.status });
}

export const POST = withErrorHandling(handle);
