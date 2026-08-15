import { normalizeKeyword } from "@/lib/keywords/normalize";

/**
 * Pure historical-comparison aggregator over already-fetched
 * search_console_metrics rows — no DB/date-math happens inside the DB layer
 * itself, so "current vs previous period" is one tested, reusable function
 * regardless of whether the window is 7 vs 7 or 28 vs 28 days. The caller
 * (lib/jobs/handlers/analyse-search-performance.ts) is responsible for
 * fetching two non-overlapping date ranges via
 * lib/db/search-console.ts's listSearchConsoleMetricsForWebsiteInRange.
 */

export interface RawSearchConsoleRow {
  date: string;
  query: string | null;
  page_url: string | null;
  clicks: number;
  impressions: number;
  position: number | null;
}

export interface QueryAggregate {
  normalizedQuery: string;
  /** First-seen original casing/spacing, for display purposes only. */
  originalQuery: string;
  clicks: number;
  impressions: number;
  /** Always clicks/impressions — recomputed, never averaged from stored per-row ctr. */
  ctr: number;
  /** Impressions-weighted average position across pages/dates in this period, or null if no row had a position. */
  position: number | null;
  /** The page URL with the most clicks for this query in this period, if any. */
  topPageUrl: string | null;
}

/** Aggregates raw rows by normalized query. Rows with an empty/null query are dropped (page-level-only rows carry no keyword signal). */
export function aggregateByQuery(rows: RawSearchConsoleRow[]): Map<string, QueryAggregate> {
  const byQuery = new Map<
    string,
    { originalQuery: string; clicks: number; impressions: number; positionWeightedSum: number; positionWeight: number; pageClicks: Map<string, number> }
  >();

  for (const row of rows) {
    const query = row.query?.trim();
    if (!query) continue;
    const normalized = normalizeKeyword(query);

    let entry = byQuery.get(normalized);
    if (!entry) {
      entry = { originalQuery: query, clicks: 0, impressions: 0, positionWeightedSum: 0, positionWeight: 0, pageClicks: new Map() };
      byQuery.set(normalized, entry);
    }

    entry.clicks += row.clicks;
    entry.impressions += row.impressions;
    if (row.position !== null) {
      entry.positionWeightedSum += row.position * row.impressions;
      entry.positionWeight += row.impressions;
    }
    if (row.page_url) {
      entry.pageClicks.set(row.page_url, (entry.pageClicks.get(row.page_url) ?? 0) + row.clicks);
    }
  }

  const result = new Map<string, QueryAggregate>();
  for (const [normalized, entry] of byQuery) {
    let topPageUrl: string | null = null;
    let topClicks = -1;
    for (const [url, clicks] of entry.pageClicks) {
      if (clicks > topClicks) {
        topClicks = clicks;
        topPageUrl = url;
      }
    }
    result.set(normalized, {
      normalizedQuery: normalized,
      originalQuery: entry.originalQuery,
      clicks: entry.clicks,
      impressions: entry.impressions,
      ctr: entry.impressions > 0 ? Math.round((entry.clicks / entry.impressions) * 10000) / 10000 : 0,
      position: entry.positionWeight > 0 ? Math.round((entry.positionWeightedSum / entry.positionWeight) * 100) / 100 : null,
      topPageUrl,
    });
  }
  return result;
}

export interface PeriodComparison {
  normalizedQuery: string;
  originalQuery: string;
  current: QueryAggregate;
  previous: QueryAggregate | null;
  /** null when the previous period had zero clicks (a percentage isn't meaningful). */
  clicksDeltaPct: number | null;
  /** null when the previous period had zero impressions. */
  impressionsDeltaPct: number | null;
  /** current.position - previous.position; positive = got worse (higher number = lower rank). Null if either side has no position. */
  positionDelta: number | null;
  /** True when this query has no previous-period data at all. */
  isNew: boolean;
}

function percentDelta(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 10000) / 100;
}

/** Compares two already-aggregated periods (see aggregateByQuery), one row
 * per query present in `current`. Queries present only in `previous` (i.e.
 * that vanished entirely) are not included — the DECLINING_KEYWORD detector
 * is about queries that still get impressions, just fewer/worse. */
export function comparePeriods(currentRows: RawSearchConsoleRow[], previousRows: RawSearchConsoleRow[]): PeriodComparison[] {
  const current = aggregateByQuery(currentRows);
  const previous = aggregateByQuery(previousRows);

  const comparisons: PeriodComparison[] = [];
  for (const [normalizedQuery, currentAgg] of current) {
    const previousAgg = previous.get(normalizedQuery) ?? null;
    comparisons.push({
      normalizedQuery,
      originalQuery: currentAgg.originalQuery,
      current: currentAgg,
      previous: previousAgg,
      clicksDeltaPct: previousAgg ? percentDelta(currentAgg.clicks, previousAgg.clicks) : null,
      impressionsDeltaPct: previousAgg ? percentDelta(currentAgg.impressions, previousAgg.impressions) : null,
      positionDelta: previousAgg && currentAgg.position !== null && previousAgg.position !== null ? Math.round((currentAgg.position - previousAgg.position) * 100) / 100 : null,
      isNew: previousAgg === null,
    });
  }
  return comparisons;
}
