/** The redirect URI must be byte-identical between the OAuth "start" and
 * "callback" legs (Google validates it against the registered Client ID),
 * and must be one of the URIs configured on the OAuth Client (see README). */
export function buildRedirectUri(origin: string): string {
  return `${origin}/api/auth/google-search-console/callback`;
}
