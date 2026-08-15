/**
 * Maps raw Google Search Console "searchAnalytics.query" API rows into the
 * shape search_console_metrics stores. Pure and side-effect-free — testable
 * without the real API. See https://developers.google.com/webmaster-tools/v1/searchanalytics/query
 */

/** One row as returned by the GSC API, dimension values in `keys` (same
 * order as the `dimensions` array sent in the request). */
export interface GscSearchAnalyticsRow {
  keys?: string[];
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
}

export interface NormalizedSearchConsoleMetric {
  date: string;
  query: string | null;
  page_url: string | null;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number | null;
}

/** Dimensions we always request, in this order — normalizeRow relies on it. */
export const SYNC_DIMENSIONS = ["date", "query", "page"] as const;

/**
 * Normalizes a single raw row. Returns null if the row has no usable date
 * (the one column search_console_metrics requires as not-null) — such a row
 * is dropped rather than stored with a fabricated date.
 */
export function normalizeSearchAnalyticsRow(row: GscSearchAnalyticsRow, dimensions: readonly string[] = SYNC_DIMENSIONS): NormalizedSearchConsoleMetric | null {
  const keys = row.keys ?? [];
  const dateIndex = dimensions.indexOf("date");
  const queryIndex = dimensions.indexOf("query");
  const pageIndex = dimensions.indexOf("page");

  const date = dateIndex >= 0 ? keys[dateIndex] : undefined;
  if (!date) return null;

  return {
    date,
    query: queryIndex >= 0 ? (keys[queryIndex] ?? null) : null,
    page_url: pageIndex >= 0 ? (keys[pageIndex] ?? null) : null,
    clicks: row.clicks ?? 0,
    impressions: row.impressions ?? 0,
    ctr: row.ctr ?? 0,
    position: row.position ?? null,
  };
}

/** Normalizes a batch of rows, dropping any without a usable date. */
export function normalizeSearchAnalyticsRows(rows: GscSearchAnalyticsRow[], dimensions: readonly string[] = SYNC_DIMENSIONS): NormalizedSearchConsoleMetric[] {
  const results: NormalizedSearchConsoleMetric[] = [];
  for (const row of rows) {
    const normalized = normalizeSearchAnalyticsRow(row, dimensions);
    if (normalized) results.push(normalized);
  }
  return results;
}
