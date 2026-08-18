import { redirect, notFound } from "next/navigation";
import { createSessionClient } from "@/lib/supabase/server-session";
import { getOrganizationBySlug } from "@/lib/db/organizations";
import { getMembershipForUser, listMembershipsForUser } from "@/lib/db/memberships";
import type { Database, MembershipRole } from "@/lib/supabase/types";

type OrganizationRow = Database["public"]["Tables"]["organizations"]["Row"];
type MembershipRow = Database["public"]["Tables"]["memberships"]["Row"];

export interface CurrentUser {
  id: string;
  email: string | null;
}

/**
 * The one function every dashboard Server Component/Action calls to find
 * out who's asking. Uses `auth.getUser()` (revalidates the JWT against the
 * Auth server), never `auth.getSession()` (only reads the local cookie,
 * unverified) — see proxy.ts's own docs for the same rule applied to the
 * middleware. Returns null rather than throwing so callers can decide
 * page-vs-action behaviour (redirect vs. a JSON-shaped error).
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createSessionClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  return { id: user.id, email: user.email ?? null };
}

/** Server Component guard — redirects to login (preserving the originally
 * requested path) rather than rendering anything when there's no session.
 * proxy.ts already redirects unauthenticated requests before they reach a
 * page component; this is the second, independent check every page makes
 * for itself rather than trusting middleware alone (defense in depth, same
 * reasoning RLS backs up the app-layer membership check below). */
export async function requireUser(currentPath: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/dashboard/login?next=${encodeURIComponent(currentPath)}`);
  return user;
}

export interface DashboardContext {
  user: CurrentUser;
  organization: OrganizationRow;
  membership: MembershipRow;
}

/**
 * The single authorisation choke point for the entire client portal: given
 * the org slug from the URL and the current request's session, resolves the
 * real organisation row and asserts — server-side, via an explicit
 * `user_id`+`organization_id` query (lib/db/memberships.ts's
 * getMembershipForUser), never inferred from the URL — that the signed-in
 * user actually belongs to it. `orgSlug` is never trusted as proof of
 * access; it only identifies *which* organisation a page is asking about.
 *
 * `notFound()` (not a 403/redirect) on a slug that doesn't resolve to a
 * membership — deliberately indistinguishable from "this organisation
 * doesn't exist" from the caller's perspective, so a user can't use this
 * page to enumerate which organisation slugs are real.
 *
 * `minRole`, when given, additionally enforces a minimum role — the same
 * check every write-capable Server Action must run before mutating
 * anything (lib/auth/permissions.ts has the exact role->capability rules;
 * this only enforces a floor, the action itself picks which permission
 * function applies).
 */
export async function requireOrganizationMembership(orgSlug: string, minRole?: MembershipRole): Promise<DashboardContext> {
  const user = await requireUser(`/dashboard/${orgSlug}`);

  const organization = await getOrganizationBySlug(orgSlug);
  if (!organization) notFound();

  const membership = await getMembershipForUser(user.id, organization.id);
  if (!membership) notFound();

  if (minRole && !roleMeetsMinimum(membership.role, minRole)) {
    throw new PermissionError(`This action requires the ${minRole} role or higher (current role: ${membership.role}).`);
  }

  return { user, organization, membership };
}

/** Thrown by requireOrganizationMembership's role check and by every
 * Server Action's own permission check — a distinct type so a Server
 * Action's catch block can show a clear "you don't have permission"
 * message instead of a generic error. */
export class PermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermissionError";
  }
}

function roleMeetsMinimum(role: MembershipRole, minRole: MembershipRole): boolean {
  const order: readonly MembershipRole[] = ["VIEWER", "EDITOR", "MANAGER", "OWNER"];
  const roleRank = order.indexOf(role);
  const minRank = order.indexOf(minRole);
  return (roleRank === -1 ? 0 : roleRank) >= (minRank === -1 ? 0 : minRank);
}

/** Every organisation the current user belongs to, with its role — feeds
 * the org switcher (spec: "Organisation switching"). Returns [] rather than
 * redirecting when there's no session; callers that need a session should
 * call requireUser first. */
export async function listCurrentUserMemberships(): Promise<Array<{ organization: OrganizationRow; role: MembershipRole }>> {
  const user = await getCurrentUser();
  if (!user) return [];
  const memberships = await listMembershipsForUser(user.id);
  const { getOrganization } = await import("@/lib/db/organizations");
  const organizations = await Promise.all(memberships.map((m) => getOrganization(m.organization_id)));
  return memberships
    .map((m, i) => ({ organization: organizations[i], role: m.role }))
    .filter((entry): entry is { organization: OrganizationRow; role: MembershipRole } => entry.organization !== null);
}
