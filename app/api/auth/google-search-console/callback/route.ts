import { NextResponse, type NextRequest } from "next/server";
import { verifyState } from "@/lib/search-console/state";
import { exchangeCodeForTokens } from "@/lib/search-console/oauth";
import { buildRedirectUri } from "@/lib/search-console/redirect-uri";
import { getSearchConsoleConnection, upsertConnectionAfterAuth } from "@/lib/db/search-console";
import { env } from "@/lib/env";
import { jsonError, withErrorHandling } from "@/lib/api/respond";

/**
 * Google redirects here after the admin consents (or declines). This route
 * is necessarily reachable without Basic Auth — Google's redirect can't
 * carry it — so the signed, expiring `state` param (lib/search-console/state.ts)
 * is the entire defence: without GOOGLE_OAUTH_CLIENT_SECRET, an attacker
 * cannot forge a state that binds to an arbitrary website_id, and a stolen
 * `code` alone is useless without also forging that state.
 */
export const GET = withErrorHandling(async (req: NextRequest) => {
  const params = req.nextUrl.searchParams;
  const error = params.get("error");
  const code = params.get("code");
  const state = params.get("state");

  if (!env.GOOGLE_OAUTH_CLIENT_ID || !env.GOOGLE_OAUTH_CLIENT_SECRET) {
    return jsonError("GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET are not configured on the server.", 500);
  }

  if (error) {
    return jsonError(`Google Search Console authorization was not granted: ${error}`, 400);
  }
  if (!code || !state) {
    return jsonError("Missing code/state in Google's callback.", 400);
  }

  const payload = verifyState(state, env.GOOGLE_OAUTH_CLIENT_SECRET);
  if (!payload) {
    return jsonError("Invalid or expired authorization state. Please retry connecting Search Console.", 400);
  }

  const redirectUri = buildRedirectUri(req.nextUrl.origin);
  const tokens = await exchangeCodeForTokens(code, redirectUri);

  // Google only returns a refresh_token on the first consent (or when
  // prompt=consent forces re-consent, which lib/search-console/oauth.ts
  // always sets) — but fall back to the previously-stored one defensively
  // rather than overwrite it with null on a re-connect.
  let refreshToken = tokens.refreshToken;
  if (!refreshToken) {
    const existing = await getSearchConsoleConnection(payload.websiteId);
    refreshToken = existing?.refresh_token ?? null;
  }
  if (!refreshToken) {
    return jsonError(
      "Google did not return a refresh token and none was previously stored. Revoke SEO Platform's access at https://myaccount.google.com/permissions and try connecting again.",
      400
    );
  }

  await upsertConnectionAfterAuth({
    organizationId: payload.organizationId,
    websiteId: payload.websiteId,
    refreshToken,
    accessToken: tokens.accessToken,
    accessTokenExpiresAt: new Date(Date.now() + tokens.expiresInSeconds * 1000).toISOString(),
    scope: tokens.scope,
  });

  // Phase 7.2C-B: dashboardOrgSlug is only ever present on a state token
  // signed by app/dashboard/[orgSlug]/search-console/connect/route.ts (a
  // dashboard-session-authenticated flow) — every existing admin-initiated
  // flow signs a state without it and lands on the exact same admin page as
  // before this change.
  const redirectPath = payload.dashboardOrgSlug
    ? `/dashboard/${payload.dashboardOrgSlug}/settings`
    : `/admin/websites/${payload.websiteId}/search-console`;
  return NextResponse.redirect(new URL(redirectPath, req.nextUrl.origin));
});
