/** Pure client-domain detection — normalizes away protocol/www so a SERP
 * result's bare domain reliably matches the website's own hostname. */
function normalizeDomain(domain: string): string {
  return domain.trim().toLowerCase().replace(/^www\./, "");
}

export function isClientDomain(resultDomain: string, websiteHostname: string): boolean {
  return normalizeDomain(resultDomain) === normalizeDomain(websiteHostname);
}
