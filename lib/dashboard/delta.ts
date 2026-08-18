/**
 * Phase 7.1C: the current/previous 28-day comparison the Reports page
 * already computed inline is now the single shared implementation — Home's
 * SEO Performance section and Reports both call these same functions
 * (Reports' own local `summarize`/`deltaLabel`/`WINDOW_DAYS` were removed
 * in the same change, not left as a second copy). Nothing about the
 * calculation itself changed; it was only moved.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** The comparison window Reports has used since Phase 7 — kept as the
 * shared default rather than a magic number repeated at each call site. */
export const DEFAULT_COMPARISON_WINDOW_DAYS = 28;

export interface ComparisonWindow {
  currentStart: string;
  currentEnd: string;
  previousStart: string;
  previousEnd: string;
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** The date ranges for "last N days" vs. "the N days before that", as
 * inclusive ISO date strings ready for
 * lib/db/search-console.ts's listSearchConsoleMetricsForWebsiteInRange. */
export function getComparisonWindow(windowDays: number = DEFAULT_COMPARISON_WINDOW_DAYS, now: Date = new Date()): ComparisonWindow {
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

export interface PeriodMetrics {
  clicks: number;
  impressions: number;
  /** Impressions-weighted average position, or null when no row in the
   * period had a position. */
  position: number | null;
}

/** Sums clicks/impressions and computes an impressions-weighted average
 * position over a set of real search_console_metrics rows for one window —
 * identical to Reports' original inline `summarize`. */
export function summarizeSearchConsoleRows(rows: SearchConsoleRowLike[]): PeriodMetrics {
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

/** Relative percentage change from `previous` to `current` — identical to
 * Reports' original inline `deltaLabel`. A previous value of 0 can't
 * produce a meaningful percentage, so it's reported as "New" (something
 * appeared where there was nothing) or "-" (still nothing) rather than a
 * divide-by-zero. */
export function computeDelta(current: number, previous: number): DeltaResult {
  if (previous === 0) return { text: current > 0 ? "New" : "-", tone: "flat" };
  const pct = Math.round(((current - previous) / previous) * 1000) / 10;
  if (pct > 0) return { text: `+${pct}%`, tone: "up" };
  if (pct < 0) return { text: `${pct}%`, tone: "down" };
  return { text: "No change", tone: "flat" };
}
