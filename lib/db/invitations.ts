import { supabaseAdmin } from "@/lib/supabase/server";
import type { Database, InvitationStatus, MembershipRole } from "@/lib/supabase/types";

type InvitationRow = Database["public"]["Tables"]["organization_invitations"]["Row"];

export interface CreateInvitationInput {
  organizationId: string;
  email: string;
  role: MembershipRole;
  invitedBy: string;
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
