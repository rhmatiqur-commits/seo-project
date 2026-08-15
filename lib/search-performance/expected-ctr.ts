/**
 * An internal, approximate "expected CTR by search-result position" curve —
 * used ONLY as a comparison baseline for the HIGH_IMPRESSIONS_LOW_CTR
 * detector to decide "is this page's actual CTR unusually low for where it
 * ranks." This is NOT sourced from Google (Google does not publish
 * click-through data), is not specific to any client's industry/vertical/
 * device mix, and is not a ranking factor — it's a smoothly-declining
 * synthetic heuristic, deliberately documented as such everywhere it's used
 * (see the admin UI's labeling of HIGH_IMPRESSIONS_LOW_CTR opportunities).
 *
 * Values are fractions (0-1), matching how search_console_metrics.ctr is
 * stored (Google's API itself returns ctr as a 0-1 fraction).
 */

const CTR_BENCHMARK_BY_POSITION: Record<number, number> = {
  1: 0.3,
  2: 0.22,
  3: 0.16,
  4: 0.12,
  5: 0.09,
  6: 0.07,
  7: 0.055,
  8: 0.045,
  9: 0.035,
  10: 0.03,
  11: 0.025,
  12: 0.022,
  13: 0.02,
  14: 0.018,
  15: 0.016,
  16: 0.014,
  17: 0.013,
  18: 0.012,
  19: 0.011,
  20: 0.01,
};

/** Fallback for positions beyond the table (rare — most detectors only care
 * about position <= 20 anyway). */
const DEFAULT_CTR_BENCHMARK_BEYOND_TABLE = 0.005;

/** Returns the internal expected-CTR benchmark (0-1 fraction) for a given
 * average position, rounded to the nearest whole position. */
export function getExpectedCtrForPosition(position: number): number {
  const rounded = Math.max(1, Math.round(position));
  return CTR_BENCHMARK_BY_POSITION[rounded] ?? DEFAULT_CTR_BENCHMARK_BEYOND_TABLE;
}

/** How far below the benchmark the actual CTR falls, as a percentage of the
 * benchmark (0 = meets/exceeds it, 100 = zero clicks despite impressions).
 * Never negative — outperforming the benchmark is not a "gap". */
export function ctrGapPercent(actualCtr: number, position: number): number {
  const expected = getExpectedCtrForPosition(position);
  if (expected <= 0) return 0;
  const gap = ((expected - actualCtr) / expected) * 100;
  return Math.max(0, Math.round(gap * 100) / 100);
}
