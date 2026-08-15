import { SYNC_DIMENSIONS, type GscSearchAnalyticsRow } from "@/lib/search-console/normalize";
import { MAX_ROWS_PER_SYNC } from "@/lib/search-console/limits";

/**
 * Thin, hand-rolled fetch wrapper around the Search Console (Webmasters v3)
 * REST API. Takes an already-valid access token — refreshing it is the
 * caller's job (lib/jobs/handlers/search-console-sync.ts), keeping this
 * module a pure HTTP client with no token-lifecycle concerns.
 */

const API_BASE = "https://www.googleapis.com/webmasters/v3";

export interface GscSite {
  siteUrl: string;
  permissionLevel: string;
}

/** Lists GSC properties the connected Google account has access to. */
export async function listSites(accessToken: string): Promise<GscSite[]> {
  const res = await fetch(`${API_BASE}/sites`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(15_000),
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`Search Console sites.list failed: ${body.error?.message ?? res.status}`);
  }
  return (body.siteEntry ?? []) as GscSite[];
}

export interface SearchAnalyticsQuery {
  siteUrl: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  rowLimit?: number;
}

/** Queries actual clicks/impressions/CTR/position, dimensioned by
 * [date, query, page] (see lib/search-console/normalize.ts SYNC_DIMENSIONS). */
export async function querySearchAnalytics(accessToken: string, { siteUrl, startDate, endDate, rowLimit = MAX_ROWS_PER_SYNC }: SearchAnalyticsQuery): Promise<GscSearchAnalyticsRow[]> {
  const res = await fetch(`${API_BASE}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      startDate,
      endDate,
      dimensions: SYNC_DIMENSIONS,
      rowLimit,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`Search Console searchAnalytics.query failed: ${body.error?.message ?? res.status}`);
  }
  return (body.rows ?? []) as GscSearchAnalyticsRow[];
}
