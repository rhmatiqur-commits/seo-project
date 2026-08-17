import { BASELINE_DEFAULT_WINDOW_DAYS, BASELINE_FALLBACK_WINDOW_DAYS, MIN_BASELINE_HISTORY_DAYS, MEASUREMENT_WINDOWS_DAYS } from "@/lib/outcomes/limits";

/**
 * Pure date-window math for baseline capture (spec section 3) and
 * measurement-window due-checks (spec section 4). No DB access — the caller
 * (lib/jobs/handlers/analyse-action-outcomes.ts) supplies "how many days of
 * history exist" and "what time is it now" so this stays unit-testable with
 * plain Date objects, same separation lib/search-performance/comparison.ts
 * uses.
 */

export interface DateRange {
  /** ISO yyyy-mm-dd, inclusive. */
  start: string;
  /** ISO yyyy-mm-dd, inclusive. */
  end: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/**
 * Picks the baseline window length: 28 days by default, 7 if that much
 * pre-action history isn't available, or null if even 7 days isn't
 * available — in which case baseline capture should be skipped entirely
 * rather than computed from a near-empty window ("where insufficient data
 * exists, 7 days may be used", spec section 3).
 */
export function pickBaselineWindowDays(daysOfHistoryBeforeAction: number): number | null {
  if (daysOfHistoryBeforeAction >= BASELINE_DEFAULT_WINDOW_DAYS) return BASELINE_DEFAULT_WINDOW_DAYS;
  if (daysOfHistoryBeforeAction >= MIN_BASELINE_HISTORY_DAYS) return BASELINE_FALLBACK_WINDOW_DAYS;
  return null;
}

/** The [start, end] date range for the baseline window — strictly pre-action
 * data, ending the day before the action executed. */
export function computeBaselineDateRange(executedAt: Date, windowDays: number): DateRange {
  const end = addDays(executedAt, -1);
  const start = addDays(end, -(windowDays - 1));
  return { start: toIsoDate(start), end: toIsoDate(end) };
}

/** True once `windowDays` have fully elapsed since the action executed —
 * "wait for sufficient data before evaluating it" (spec section 4), never
 * called an outcome successful/failed before this is true. */
export function isMeasurementWindowDue(executedAt: Date, windowDays: number, now: Date): boolean {
  return addDays(executedAt, windowDays).getTime() <= now.getTime();
}

/** Every configured measurement window (spec section 4: 7/14/28/56 days)
 * that's due right now, ascending — the job computes/upserts an outcome row
 * for each one that's due and not already computed. */
export function dueMeasurementWindows(executedAt: Date, now: Date, windows: readonly number[] = MEASUREMENT_WINDOWS_DAYS): number[] {
  return windows.filter((days) => isMeasurementWindowDue(executedAt, days, now));
}

/** The [start, end] date range for a post-action measurement window,
 * starting the day the action executed. */
export function computeMeasurementDateRange(executedAt: Date, windowDays: number): DateRange {
  const start = executedAt;
  const end = addDays(executedAt, windowDays - 1);
  return { start: toIsoDate(start), end: toIsoDate(end) };
}
