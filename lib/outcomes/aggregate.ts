import type { RawMetricRow, WindowMetrics } from "@/lib/outcomes/types";

/**
 * Aggregates raw search_console_metrics-shaped rows (already filtered by the
 * caller to one date window + one subject — a keyword's rows, or a URL's
 * rows) into a single WindowMetrics summary. Position is an
 * impressions-weighted average — same maths as
 * lib/search-performance/comparison.ts's aggregateByQuery, kept as its own
 * smaller function here because Phase 6 aggregates by *subject* (keyword or
 * URL), not by query text grouping.
 */
export function aggregateWindowMetrics(rows: RawMetricRow[]): WindowMetrics {
  let clicks = 0;
  let impressions = 0;
  let positionWeightedSum = 0;
  let positionWeight = 0;

  for (const row of rows) {
    clicks += row.clicks;
    impressions += row.impressions;
    if (row.position !== null) {
      positionWeightedSum += row.position * row.impressions;
      positionWeight += row.impressions;
    }
  }

  return {
    clicks,
    impressions,
    ctr: impressions > 0 ? Math.round((clicks / impressions) * 10000) / 10000 : 0,
    position: positionWeight > 0 ? Math.round((positionWeightedSum / positionWeight) * 100) / 100 : null,
  };
}

export const EMPTY_WINDOW_METRICS: WindowMetrics = { clicks: 0, impressions: 0, ctr: 0, position: null };
