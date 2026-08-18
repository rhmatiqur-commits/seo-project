import { supabaseAdmin } from "@/lib/supabase/server";

export interface AuthUserSummary {
  id: string;
  email: string | null;
  lastSignInAt: string | null;
}

/**
 * Supabase Auth owns `auth.users` (email, last sign-in, etc.) — not exposed
 * through PostgREST/RLS, only through the GoTrue Admin API
 * (`auth.admin.*`), which requires the service-role key. This is the one
 * place the client portal reaches for "who is this member" display info
 * (Settings' Team list); it's a read of non-sensitive profile data (email),
 * never credentials, and only ever called server-side.
 */
export async function getAuthUserById(userId: string): Promise<AuthUserSummary | null> {
  const db = supabaseAdmin();
  const { data, error } = await db.auth.admin.getUserById(userId);
  if (error) {
    // A membership row whose user was deleted from auth.users shouldn't crash
    // the whole team list — surfaced as "unknown user" by the caller instead.
    return null;
  }
  return { id: data.user.id, email: data.user.email ?? null, lastSignInAt: data.user.last_sign_in_at ?? null };
}

/** Batches getAuthUserById for a list of ids (e.g. every member of an
 * organisation) — the Admin API has no bulk-by-id lookup, so this is
 * Promise.all over the single-user call; fine at organisation-membership
 * scale (tens of users, not thousands). */
export async function listAuthUsersByIds(userIds: string[]): Promise<Map<string, AuthUserSummary>> {
  const results = await Promise.all(userIds.map((id) => getAuthUserById(id)));
  const map = new Map<string, AuthUserSummary>();
  for (const user of results) {
    if (user) map.set(user.id, user);
  }
  return map;
}

/** Looks up an existing Supabase Auth user by email — used by the invite-
 * acceptance flow to decide "does this person already have an account" vs
 * "this is their first time" (lib/auth/invitations.ts). Supabase's Admin API
 * has no direct get-by-email, so this pages through listUsers filtering
 * client-side — acceptable at this platform's scale (an operator's client
 * base, not a public consumer app); flagged if that stops being true. */
export async function findAuthUserByEmail(email: string): Promise<AuthUserSummary | null> {
  const db = supabaseAdmin();
  const normalized = email.trim().toLowerCase();
  let page = 1;
  const perPage = 200;
  for (let i = 0; i < 25; i++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const match = data.users.find((u) => (u.email ?? "").toLowerCase() === normalized);
    if (match) return { id: match.id, email: match.email ?? null, lastSignInAt: match.last_sign_in_at ?? null };
    if (data.users.length < perPage) return null; // last page
    page++;
  }
  return null;
}
