import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getOrganizationBySlug } from "@/lib/db/organizations";
import { getMembershipForUser } from "@/lib/db/memberships";
import { canManageIntegrations } from "@/lib/auth/permissions";
import { getPrimaryWebsiteForOrganization } from "@/lib/dashboard/website";
import { buildAuthUrl } from "@/lib/search-console/oauth";
import { signState } from "@/lib/search-console/state";
import { buildRedirectUri } from "@/lib/search-console/redirect-uri";
import { env } from "@/lib/env";
import { jsonError, withErrorHandling } from "@/lib/api/respond";

/**
 * Phase 7.2C-B: the client-dashboard entry point into the Google Search
 * Console OAuth flow — reuses every piece of the existing mechanics
 * (lib/search-console/oauth.ts's buildAuthUrl, lib/search-console/state.ts's
 * signed state, the shared callback at
 * app/api/auth/google-search-console/callback/route.ts) and adds nothing
 * new to any of them except the optional dashboardOrgSlug state field.
 *
 * The existing admin route (app/api/auth/google-search-console/start/route.ts)
 * is untouched and keeps working exactly as before — this is a second,
 * separate entry point for a different, less-trusted audience, not a
 * hardening of that one.
 *
 * Deliberately placed under app/dashboard/[orgSlug]/... (not app/api/...):
 * proxy.ts checks `pathname.startsWith("/dashboard")` before its Basic-Auth
 * branch even runs, so this path already gets the exact same Supabase
 * session check (redirect to /dashboard/login if unauthenticated) every
 * other dashboard page/action gets, with zero changes to proxy.ts itself.
 *
 * Authorization is re-derived from the session on every request, the same
 * way every dashboard Server Action already works — org_slug is a lookup
 * key only, never trusted as proof of access, and the website is always
 * resolved server-side via getPrimaryWebsiteForOrganization, never taken
 * from client input the way the admin route's own website_id query
 * parameter is (that pattern is intentionally not reused here).
 */
export const GET = withErrorHandling(async (req: NextRequest, { params }: { params: Promise<{ orgSlug: string }> }) => {
  const { orgSlug } = await params;

  // proxy.ts's handleDashboardAuth already redirects an unauthenticated
  // request to /dashboard/login before this handler ever runs; this check
  // is defense in depth, not the primary gate.
  const user = await getCurrentUser();
  if (!user) return jsonError("Sign in required.", 401);

  const organization = await getOrganizationBySlug(orgSlug);
  if (!organization) return jsonError("Organisation not found.", 404);

  const membership = await getMembershipForUser(user.id, organization.id);
  if (!membership) return jsonError("You are not a member of this organisation.", 403);

  if (!canManageIntegrations(membership.role)) {
    return jsonError("Only the account Owner can connect Search Console.", 403);
  }

  const website = await getPrimaryWebsiteForOrganization(organization.id);
  if (!website) return jsonError("No website is set up for this organisation yet.", 404);

  if (!env.GOOGLE_OAUTH_CLIENT_ID || !env.GOOGLE_OAUTH_CLIENT_SECRET) {
    return jsonError("GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET are not configured on the server.", 500);
  }

  const state = signState({ websiteId: website.id, organizationId: organization.id, dashboardOrgSlug: orgSlug }, env.GOOGLE_OAUTH_CLIENT_SECRET);
  const redirectUri = buildRedirectUri(req.nextUrl.origin);
  const authUrl = buildAuthUrl(state, redirectUri);

  return NextResponse.redirect(authUrl);
});
