import { supabaseAdmin } from "@/lib/supabase/server";
import type { Database, MembershipRole } from "@/lib/supabase/types";

type MembershipRow = Database["public"]["Tables"]["memberships"]["Row"];

/**
 * Uses the service-role client with an *explicit* `user_id`/`organization_id`
 * filter (not the RLS-scoped session client) — this is the one query the
 * whole client portal's authorisation depends on
 * (lib/auth/session.ts's requireOrganizationMembership), so it's written the
 * same direct, explicit way every other lib/db/* query is, rather than
 * leaning on RLS to also be correct here. `userId` must come from a
 * server-verified `auth.getUser()` call, never from client input — see
 * lib/auth/session.ts's own docs.
 */
export async function getMembershipForUser(userId: string, organizationId: string): Promise<MembershipRow | null> {
  const db = supabaseAdmin();
  const { data, error } = await db.from("memberships").select("*").eq("user_id", userId).eq("organization_id", organizationId).maybeSingle();
  if (error) throw error;
  return data;
}

/** Every organisation a user belongs to, with role — feeds the org switcher (spec: "Organisation switching"). */
export async function listMembershipsForUser(userId: string): Promise<MembershipRow[]> {
  const db = supabaseAdmin();
  const { data, error } = await db.from("memberships").select("*").eq("user_id", userId).order("created_at", { ascending: true });
  if (error) throw error;
  return data;
}

/** Every member of an organisation — feeds the Settings "Team" list. Email/display
 * info isn't stored here (Supabase Auth owns that in `auth.users`) — see
 * lib/auth/users.ts's listAuthUsersByIds for the join. */
export async function listMembersForOrganization(organizationId: string): Promise<MembershipRow[]> {
  const db = supabaseAdmin();
  const { data, error } = await db.from("memberships").select("*").eq("organization_id", organizationId).order("created_at", { ascending: true });
  if (error) throw error;
  return data;
}

export async function insertMembership(input: { organizationId: string; userId: string; role: MembershipRole }): Promise<MembershipRow> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("memberships")
    .insert({ organization_id: input.organizationId, user_id: input.userId, role: input.role })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateMembershipRole(id: string, role: MembershipRole): Promise<MembershipRow> {
  const db = supabaseAdmin();
  const { data, error } = await db.from("memberships").update({ role }).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

export async function getMembershipById(id: string): Promise<MembershipRow | null> {
  const db = supabaseAdmin();
  const { data, error } = await db.from("memberships").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function deleteMembership(id: string): Promise<void> {
  const db = supabaseAdmin();
  const { error } = await db.from("memberships").delete().eq("id", id);
  if (error) throw error;
}

/** How many OWNER memberships an organisation has — used to refuse
 * demoting/removing the last OWNER (an organisation must always keep at
 * least one, or nobody could ever manage it again). */
export async function countOwners(organizationId: string): Promise<number> {
  const db = supabaseAdmin();
  const { count, error } = await db.from("memberships").select("*", { count: "exact", head: true }).eq("organization_id", organizationId).eq("role", "OWNER");
  if (error) throw error;
  return count ?? 0;
}
