/**
 * Phase 7.1F: the single shared period-over-period comparison used by every
 * client-facing Search Console stat — extracted so Home and Reports show
 * the *same* clicks/impressions numbers for "the last 28 days" instead of
 * two different aggregations (previously Home showed an all-time total,
 * Reports a 28-day-vs-previous-28-day comparison; a client comparing the
 * two pages had no way to know they weren't measuring the same thing).
 * Pure date/aggregation math only — no new Search Console query, no new
 * metric, no change to how search_console_metrics rows are collected.
 */

export const DEFAULT_COMPARISON_WINDOW_DAYS = 28;

const DAY_MS = 24 * 60 * 60 * 1000;

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export interface ComparisonWindow {
  currentStart: string;
  currentEnd: string;
  previousStart: string;
  previousEnd: string;
}

/** `now` back `windowDays` days is "current"; the same length immediately
 * before that is "previous" — the exact window Reports has used since
 * Phase 7.1B, now shared rather than duplicated. */
export function getComparisonWindow(now: Date, windowDays: number = DEFAULT_COMPARISON_WINDOW_DAYS): ComparisonWindow {
  const currentStart = new Date(now.getTime() - windowDays * DAY_MS);
  const previousEnd = new Date(currentStart.getTime() - DAY_MS);
  const previousStart = new Date(previousEnd.getTime() - windowDays * DAY_MS);
  return {
    currentStart: toIsoDate(currentStart),
    currentEnd: toIsoDate(now),
    previousStart: toIsoDate(previousStart),
    previousEnd: toIsoDate(previousEnd),
  };
}

export interface SearchConsoleRowLike {
  clicks: number;
  impressions: number;
  position: number | null;
}

export interface SearchConsoleSummary {
  clicks: number;
  impressions: number;
  /** Impression-weighted average — null when there are no rows with a position at all. */
  position: number | null;
}

export function summarizeSearchConsoleRows(rows: readonly SearchConsoleRowLike[]): SearchConsoleSummary {
  let clicks = 0;
  let impressions = 0;
  let posSum = 0;
  let posWeight = 0;
  for (const r of rows) {
    clicks += r.clicks;
    impressions += r.impressions;
    if (r.position !== null) {
      posSum += r.position * r.impressions;
      posWeight += r.impressions;
    }
  }
  return { clicks, impressions, position: posWeight > 0 ? Math.round((posSum / posWeight) * 10) / 10 : null };
}

export interface DailySearchConsolePoint {
  date: string;
  clicks: number;
  impressions: number;
  /** Impression-weighted average for that day — null on a day with no
   * impressions at all, same "don't invent a number" rule as
   * SearchConsoleSummary.position. */
  position: number | null;
}

/**
 * Phase 7.2I: aggregates raw Search Console rows (one row per
 * date+query+page — several rows can share a date) into one point per
 * calendar day across [startDate, endDate] inclusive, for the trend charts
 * on Reports and Home. A day with no synced rows gets zero clicks/
 * impressions (never skipped, so the chart is a continuous, evenly-spaced
 * timeline instead of gaps a client could misread as missing days) and a
 * null position (there is genuinely nothing to average). Position uses the
 * exact same impression-weighted formula as summarizeSearchConsoleRows, one
 * day at a time instead of over the whole window. No new query: callers
 * already fetch these rows for the existing period-over-period stat cards.
 */
export function buildDailySearchConsoleSeries(
  rows: readonly (SearchConsoleRowLike & { date: string })[],
  startDate: string,
  endDate: string
): DailySearchConsolePoint[] {
  const byDate = new Map<string, { clicks: number; impressions: number; posSum: number; posWeight: number }>();
  for (const r of rows) {
    const existing = byDate.get(r.date) ?? { clicks: 0, impressions: 0, posSum: 0, posWeight: 0 };
    existing.clicks += r.clicks;
    existing.impressions += r.impressions;
    if (r.position !== null) {
      existing.posSum += r.position * r.impressions;
      existing.posWeight += r.impressions;
    }
    byDate.set(r.date, existing);
  }
  const points: DailySearchConsolePoint[] = [];
  let cursor = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  while (cursor.getTime() <= end.getTime()) {
    const iso = toIsoDate(cursor);
    const agg = byDate.get(iso);
    points.push({
      date: iso,
      clicks: agg?.clicks ?? 0,
      impressions: agg?.impressions ?? 0,
      position: agg && agg.posWeight > 0 ? Math.round((agg.posSum / agg.posWeight) * 10) / 10 : null,
    });
    cursor = new Date(cursor.getTime() + DAY_MS);
  }
  return points;
}

export interface DeltaResult {
  text: string;
  tone: "up" | "down" | "flat";
}

export function computeDelta(current: number, previous: number): DeltaResult {
  if (previous === 0) return { text: current > 0 ? "New" : "-", tone: "flat" };
  const pct = Math.round(((current - previous) / previous) * 1000) / 10;
  if (pct > 0) return { text: `+${pct}%`, tone: "up" };
  if (pct < 0) return { text: `${pct}%`, tone: "down" };
  return { text: "No change", tone: "flat" };
}
