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
