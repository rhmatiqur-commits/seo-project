import { supabaseAdmin } from "@/lib/supabase/server";
import type { Database, InvitationStatus, MembershipRole } from "@/lib/supabase/types";

type InvitationRow = Database["public"]["Tables"]["organization_invitations"]["Row"];

export interface CreateInvitationInput {
  organizationId: string;
  email: string;
  role: MembershipRole;
  /**
   * The SEO-side user who requested this invitation, or `null` when it was
   * requested by an external, non-SEO-user caller -- specifically the
   * BusinessOS integration (see app/api/businessos-integration/invitations/route.ts).
   * `invited_by` has always been nullable (`on delete set null`, migration
   * 0027) so this needed no schema change. A `null` value here is not "we
   * don't know who invited them" the way a deleted-user null would be --
   * it's "a caller outside this app's own auth.users requested this,"
   * distinguishable from a normal Settings-page invite by checking whether
   * invited_by is set at all. No separate "source" column or synthetic
   * system user was introduced for this -- a real, accepted limitation of
   * this attribution model, not solved here (Phase 3D product-owner
   * decision: nullable invited_by, no synthetic user).
   */
  invitedBy: string | null;
}

/** One pending invitation per (organisation, email) — enforced by the DB's
 * own partial unique index (migration 0027), not just this check; re-invites
 * after acceptance/revocation are fine, a second simultaneous pending one
 * for the same email is not. */
export async function insertInvitation(input: CreateInvitationInput): Promise<InvitationRow> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("organization_invitations")
    .insert({
      organization_id: input.organizationId,
      email: input.email.trim().toLowerCase(),
      role: input.role,
      invited_by: input.invitedBy,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Phase 3D: lets a caller check for an existing pending invitation before
 * creating a new one -- specifically the businessos-integration invitations
 * route, so a repeated request returns the existing invitation's id
 * idempotently instead of relying solely on catching the unique-index
 * violation. Does not replace that constraint (see migration 0027) -- this
 * is a courtesy lookup, the constraint is still what actually prevents a
 * genuine duplicate under a race.
 */
export async function getPendingInvitationForEmail(organizationId: string, email: string): Promise<InvitationRow | null> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("organization_invitations")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("email", email.trim().toLowerCase())
    .eq("status", "pending")
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** The acceptance token is the only thing the invited user's link carries —
 * looked up server-side, the organisation/role always come from this row,
 * never from anything the browser supplies (spec: "Never allow an invited
 * user to choose their organisation ID from the browser"). */
export async function getInvitationByToken(token: string): Promise<InvitationRow | null> {
  const db = supabaseAdmin();
  const { data, error } = await db.from("organization_invitations").select("*").eq("token", token).maybeSingle();
  if (error) throw error;
  return data;
}

export async function listInvitationsForOrganization(organizationId: string, status?: InvitationStatus): Promise<InvitationRow[]> {
  const db = supabaseAdmin();
  let query = db.from("organization_invitations").select("*").eq("organization_id", organizationId);
  if (status) query = query.eq("status", status);
  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function getInvitationById(id: string): Promise<InvitationRow | null> {
  const db = supabaseAdmin();
  const { data, error } = await db.from("organization_invitations").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function markInvitationAccepted(id: string): Promise<InvitationRow> {
  const db = supabaseAdmin();
  const { data, error } = await db.from("organization_invitations").update({ status: "accepted", accepted_at: new Date().toISOString() }).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

export async function revokeInvitation(id: string): Promise<InvitationRow> {
  const db = supabaseAdmin();
  const { data, error } = await db.from("organization_invitations").update({ status: "revoked" }).eq("id", id).select().single();
  if (error) throw error;
  return data;
}
