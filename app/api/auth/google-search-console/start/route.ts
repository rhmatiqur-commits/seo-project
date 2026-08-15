import { NextResponse, type NextRequest } from "next/server";
import { getWebsite } from "@/lib/db/websites";
import { buildAuthUrl } from "@/lib/search-console/oauth";
import { signState } from "@/lib/search-console/state";
import { buildRedirectUri } from "@/lib/search-console/redirect-uri";
import { env } from "@/lib/env";
import { jsonError, withErrorHandling } from "@/lib/api/respond";

/** Starts the Google Search Console OAuth flow for a website: signs a
 * short-lived state binding this request to the website, then redirects to
 * Google's consent screen. Reached by clicking "Connect Search Console" on
 * the admin website page — that page is already Basic-Auth-gated
 * (proxy.ts), which is what authorizes this GET to run. */
export const GET = withErrorHandling(async (req: NextRequest) => {
  const websiteId = req.nextUrl.searchParams.get("website_id");
  if (!websiteId) return jsonError("Missing website_id query parameter", 400);

  const website = await getWebsite(websiteId);
  if (!website) return jsonError("Website not found", 404);

  if (!env.GOOGLE_OAUTH_CLIENT_ID || !env.GOOGLE_OAUTH_CLIENT_SECRET) {
    return jsonError("GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET are not configured on the server.", 500);
  }

  const state = signState({ websiteId: website.id, organizationId: website.organization_id }, env.GOOGLE_OAUTH_CLIENT_SECRET);
  const redirectUri = buildRedirectUri(req.nextUrl.origin);
  const authUrl = buildAuthUrl(state, redirectUri);

  return NextResponse.redirect(authUrl);
});
