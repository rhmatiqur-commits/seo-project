import { env } from "@/lib/env";

/**
 * Thin, hand-rolled fetch wrapper around Google's OAuth 2.0 endpoints — same
 * "no heavy SDK" philosophy already used by the crawler (lib/crawler/*).
 * Avoids pulling in the very large `googleapis` package for three endpoints.
 */

export const SEARCH_CONSOLE_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

function requireClientCredentials(): { clientId: string; clientSecret: string } {
  if (!env.GOOGLE_OAUTH_CLIENT_ID || !env.GOOGLE_OAUTH_CLIENT_SECRET) {
    throw new Error(
      "GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET are not set. Add them to .env.local to enable the Search Console integration."
    );
  }
  return { clientId: env.GOOGLE_OAUTH_CLIENT_ID, clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET };
}

/** Builds the URL to redirect the admin to for Google's consent screen.
 * `access_type=offline` + `prompt=consent` guarantee a refresh_token comes
 * back even on a re-connect (Google otherwise omits it after the first
 * grant). */
export function buildAuthUrl(state: string, redirectUri: string): string {
  const { clientId } = requireClientCredentials();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SEARCH_CONSOLE_SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export interface ExchangedTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresInSeconds: number;
  scope: string;
}

/** Exchanges an authorization code for tokens. Throws on failure — the
 * caller (the OAuth callback route) surfaces the error to the admin. */
export async function exchangeCodeForTokens(code: string, redirectUri: string): Promise<ExchangedTokens> {
  const { clientId, clientSecret } = requireClientCredentials();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`Google token exchange failed: ${body.error ?? res.status} ${body.error_description ?? ""}`.trim());
  }
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token ?? null,
    expiresInSeconds: body.expires_in,
    scope: body.scope,
  };
}

export interface RefreshedTokens {
  accessToken: string;
  expiresInSeconds: number;
}

/** Exchanges a stored refresh_token for a fresh access_token. Throws on
 * failure (e.g. the refresh_token was revoked) — the caller marks the
 * connection status 'error' with the message rather than crash-looping. */
export async function refreshAccessToken(refreshToken: string): Promise<RefreshedTokens> {
  const { clientId, clientSecret } = requireClientCredentials();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`Google token refresh failed: ${body.error ?? res.status} ${body.error_description ?? ""}`.trim());
  }
  return {
    accessToken: body.access_token,
    expiresInSeconds: body.expires_in,
  };
}
