import { getWebsite, updateWebsite } from "@/lib/db/websites";
import { getSearchConsoleConnection, updateConnectionAccessToken, markConnectionStatus, upsertSearchConsoleMetrics } from "@/lib/db/search-console";
import { refreshAccessToken } from "@/lib/search-console/oauth";
import { querySearchAnalytics } from "@/lib/search-console/client";
import { normalizeSearchAnalyticsRows } from "@/lib/search-console/normalize";
import { SYNC_LOOKBACK_DAYS, MAX_ROWS_PER_SYNC } from "@/lib/search-console/limits";
import type { JobHandler } from "@/lib/jobs/types";

// Refresh the access token if it expires within this window, rather than
// waiting for an outright 401 from the API — avoids a guaranteed-failing
// first request on every sync whose token happens to have just expired.
const TOKEN_REFRESH_SKEW_MS = 5 * 60 * 1000;

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10); // YYYY-MM-DD, what the GSC API expects
}

export interface SearchConsoleSyncResult {
  siteUrl: string;
  rowsFetched: number;
  rowsStored: number;
  startDate: string;
  endDate: string;
}

export const handleSearchConsoleSync: JobHandler = async ({ job }) => {
  if (!job.website_id) throw new Error("SEARCH_CONSOLE_SYNC job is missing website_id");
  const website = await getWebsite(job.website_id);
  if (!website) throw new Error(`Website ${job.website_id} not found`);

  const connection = await getSearchConsoleConnection(website.id);
  if (!connection) throw new Error(`Website ${website.id} has no Search Console connection.`);
  if (connection.status !== "active" || !connection.site_url) {
    throw new Error(`Website ${website.id} Search Console connection is not active (status=${connection.status}). Complete the site-selection step first.`);
  }

  let accessToken = connection.access_token;
  const expiresAt = connection.access_token_expires_at ? new Date(connection.access_token_expires_at).getTime() : 0;
  const needsRefresh = !accessToken || Date.now() + TOKEN_REFRESH_SKEW_MS >= expiresAt;

  if (needsRefresh) {
    try {
      const refreshed = await refreshAccessToken(connection.refresh_token);
      accessToken = refreshed.accessToken;
      const newExpiresAt = new Date(Date.now() + refreshed.expiresInSeconds * 1000).toISOString();
      await updateConnectionAccessToken(website.id, accessToken, newExpiresAt);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await markConnectionStatus(website.id, "error", message);
      throw error;
    }
  }

  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - SYNC_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  let rows;
  try {
    rows = await querySearchAnalytics(accessToken!, {
      siteUrl: connection.site_url,
      startDate: toIsoDate(startDate),
      endDate: toIsoDate(endDate),
      rowLimit: MAX_ROWS_PER_SYNC,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await markConnectionStatus(website.id, "error", message);
    throw error;
  }

  const normalized = normalizeSearchAnalyticsRows(rows);
  const stored = await upsertSearchConsoleMetrics(website.organization_id, website.id, normalized);

  // A successful sync clears any earlier error state.
  await markConnectionStatus(website.id, "active", null);

  // Schedule the next recurring sync (mirrors handleCrawlWebsite's
  // next_crawl_at / handleKeywordDiscovery's next_keyword_discovery_at pattern).
  const nextRunAt = new Date(Date.now() + website.search_console_sync_frequency_days * 24 * 60 * 60 * 1000);
  await updateWebsite(website.id, { next_search_console_sync_at: nextRunAt.toISOString() });

  const result: SearchConsoleSyncResult = {
    siteUrl: connection.site_url,
    rowsFetched: rows.length,
    rowsStored: stored,
    startDate: toIsoDate(startDate),
    endDate: toIsoDate(endDate),
  };
  return { ...result };
};
