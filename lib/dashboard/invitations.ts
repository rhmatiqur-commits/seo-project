/**
 * Phase 7.2C-A/C: pure helpers behind the "Pending invitations" table on
 * Settings — no DB access, no new invitation-generation or status-transition
 * logic. The token organization_invitations already generates (migration
 * 0027, `token uuid not null default gen_random_uuid()`) and the exact URL
 * shape app/dashboard/accept-invite/page.tsx already expects
 * (`?token=...`) are both untouched; this only formats/classifies existing
 * columns for display.
 */
import type { Database, InvitationStatus } from "@/lib/supabase/types";

type InvitationRow = Database["public"]["Tables"]["organization_invitations"]["Row"];

export function buildInviteAcceptUrl(origin: string, token: string): string {
  return `${origin}/dashboard/accept-invite?token=${token}`;
}

/**
 * Phase 7.2C-C: a DB-status-'pending' row whose expires_at has already
 * passed reads as 'expired' here — the exact same live comparison
 * app/dashboard/accept-invite/page.tsx already uses to decide whether a
 * token is still usable (`new Date(invitation.expires_at) < new Date()`),
 * applied for display only. No new DB status is ever written — the
 * `'expired'` enum value already exists (migration 0027) but nothing writes
 * it; this function is the only place that value is ever produced, and only
 * in memory, never persisted.
 */
export function invitationDisplayStatus(invitation: Pick<InvitationRow, "status" | "expires_at">, now: Date = new Date()): InvitationStatus {
  if (invitation.status === "pending" && new Date(invitation.expires_at) < now) return "expired";
  return invitation.status;
}
