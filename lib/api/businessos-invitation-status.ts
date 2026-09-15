import { invitationDisplayStatus } from "@/lib/dashboard/invitations";
import type { Database, InvitationStatus } from "@/lib/supabase/types";

type InvitationRow = Database["public"]["Tables"]["organization_invitations"]["Row"];

/**
 * Phase 3F: resolves what POST /api/businessos-integration/invitation-status
 * should report for one invitation, given the organisationId the caller
 * claims it belongs to. Pure -- no DB access, no `lib/env` import -- so
 * it's unit-testable without the whole required-env schema populated, same
 * reasoning as lib/api/businessos-auth.ts's isAuthorizedBearer.
 *
 * Deliberately reuses invitationDisplayStatus() rather than re-deriving
 * "is this actually expired" -- that column never transitions to 'expired'
 * in the database (see that function's own comment); computing it a second
 * time here would risk drifting from the one place this platform has
 * already gotten it right and already tested.
 *
 * `ok: false` covers three cases the caller must treat identically (same
 * generic 404, per minimum-disclosure): the invitation doesn't exist, or
 * it exists but belongs to a different organisation than the one claimed
 * -- the same "never let a caller discover something by mismatch" IDOR
 * guard lib/api/authorize.ts's assertOwnedByOrganization already
 * establishes elsewhere in this codebase, applied here as a pure function
 * instead of a throwing one since this route has no existing resource
 * already known-good to fall back to.
 */
export type ResolvedInvitationStatus = { ok: true; status: InvitationStatus } | { ok: false };

export function resolveInvitationStatus(
  invitation: Pick<InvitationRow, "status" | "expires_at" | "organization_id"> | null,
  expectedOrganizationId: string,
  now: Date = new Date(),
): ResolvedInvitationStatus {
  if (!invitation) return { ok: false };
  if (invitation.organization_id !== expectedOrganizationId) return { ok: false };
  return { ok: true, status: invitationDisplayStatus(invitation, now) };
}
