import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { getOrganization } from "@/lib/db/organizations";
import { getMembershipForUser } from "@/lib/db/memberships";
import { findAuthUserByEmail } from "@/lib/auth/users";
import { insertInvitation, getPendingInvitationForEmail } from "@/lib/db/invitations";
import { isAuthorizedBearer } from "@/lib/api/businessos-auth";
import { isRateLimited } from "@/lib/api/rate-limit";
import { jsonError, jsonZodError, withErrorHandling } from "@/lib/api/respond";

/**
 * Phase 3D: lets the BusinessOS platform ask this platform to invite an
 * email into one of our organisations, at one of our own real roles.
 * Reuses the existing Phase 7 invitation mechanism (lib/db/invitations.ts,
 * app/dashboard/accept-invite/**) entirely as-is -- this route is the one
 * new thing, not a second invitation system. The actual proof that the
 * invited person owns that email address is still, exactly as before,
 * the accept-invite flow itself (set a password / sign in) -- this route
 * never treats BusinessOS's request as identity proof on its own.
 */

const requestSchema = z.object({
  organizationId: z.string().uuid(),
  email: z.string().trim().toLowerCase().email(),
  // Deliberately narrower than this platform's own role vocabulary
  // (OWNER/MANAGER/EDITOR/VIEWER, migration 0026) -- EDITOR is excluded
  // here on purpose (hardening review, post-Phase 3D). BusinessOS's own
  // approved role mapping (its src/core/seo/roles.ts) only ever produces
  // OWNER/MANAGER/VIEWER; EDITOR was never a value this integration
  // needed to accept, so it's rejected at this boundary rather than left
  // reachable "just in case" -- if BusinessOS's mapping ever changes to
  // want EDITOR, that's a deliberate contract change to make here, not a
  // value this endpoint should have been silently willing to grant all
  // along. The normal, human-facing Settings-page invitation flow
  // (app/dashboard/actions.ts) is untouched and still grants all four
  // roles including EDITOR -- this restriction applies only to requests
  // authenticated as the BusinessOS integration. The dead Phase 1 values
  // (owner/admin/member) remain excluded as before.
  role: z.enum(["OWNER", "MANAGER", "VIEWER"]),
});

async function handle(req: NextRequest): Promise<Response> {
  if (!isAuthorizedBearer(req.headers.get("authorization"), env.BUSINESSOS_INTEGRATION_SECRET)) return jsonError("Unauthorized", 401);
  if (isRateLimited("businessos-integration")) return jsonError("Rate limited", 429);

  const body = await req.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return jsonZodError(parsed.error);

  const { organizationId, email, role } = parsed.data;

  const organization = await getOrganization(organizationId);
  // Same response whether the id doesn't exist at all or exists but isn't
  // allowlisted for this integration (organizations.businessos_integration_enabled,
  // migration 0029) -- see verify-organization/route.ts's identical check
  // for the full rationale. That flag is trusted-admin-controlled only;
  // nothing in this route ever sets it.
  if (!organization || !organization.businessos_integration_enabled) return jsonError("Organisation not found", 404);

  // Already a member? Don't create a redundant invitation -- report it
  // plainly so BusinessOS can show "this person already has SEO access"
  // instead of "invitation sent".
  const existingUser = await findAuthUserByEmail(email);
  if (existingUser) {
    const membership = await getMembershipForUser(existingUser.id, organizationId);
    if (membership) {
      return NextResponse.json({ status: "already_member", invitationId: null }, { status: 201 });
    }
  }

  // Already has a pending invitation for this org? Return it idempotently
  // rather than erroring -- a repeated BusinessOS request (a retry, a
  // double-click upstream) should never spam a second invitation.
  const existingInvitation = await getPendingInvitationForEmail(organizationId, email);
  if (existingInvitation) {
    return NextResponse.json({ status: "sent", invitationId: existingInvitation.id }, { status: 201 });
  }

  try {
    // invitedBy: null -- this invitation was requested by the BusinessOS
    // integration, not by a signed-in SEO user. See CreateInvitationInput's
    // own comment in lib/db/invitations.ts for why that's the accepted
    // attribution model rather than a synthetic system user.
    const invitation = await insertInvitation({ organizationId, email, role, invitedBy: null });
    return NextResponse.json({ status: "sent", invitationId: invitation.id }, { status: 201 });
  } catch (error) {
    // Race: another request created the pending invitation between our
    // check above and this insert. The unique index (migration 0027) is
    // what actually prevents the duplicate; treat its rejection as the
    // same idempotent "sent" outcome, not an error.
    const code = (error as { code?: string } | null)?.code;
    if (code === "23505") {
      const invitation = await getPendingInvitationForEmail(organizationId, email);
      if (invitation) return NextResponse.json({ status: "sent", invitationId: invitation.id }, { status: 201 });
    }
    throw error;
  }
}

export const POST = withErrorHandling(handle);
