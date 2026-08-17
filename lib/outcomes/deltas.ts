import type { WindowMetrics, OutcomeDeltas } from "@/lib/outcomes/types";

function percentDelta(current: number, baseline: number): number | null {
  if (baseline === 0) return null;
  return Math.round(((current - baseline) / baseline) * 10000) / 100;
}

/**
 * Pure delta computation between a baseline and a current WindowMetrics.
 * `positionChange = baseline.position - current.position`, so a POSITIVE
 * value means the position *improved* (a smaller/better rank number) —
 * "Position improved from 14.2 to 9.8" yields +4.4, matching the spec's
 * example and its explicit "lower average position number = improvement"
 * rule.
 */
export function computeOutcomeDeltas(baseline: WindowMetrics, current: WindowMetrics): OutcomeDeltas {
  return {
    clicksChange: current.clicks - baseline.clicks,
    clicksChangePct: percentDelta(current.clicks, baseline.clicks),
    impressionsChange: current.impressions - baseline.impressions,
    impressionsChangePct: percentDelta(current.impressions, baseline.impressions),
    // ctr is stored as a 0-1 fraction; convert to percentage points for a human-readable delta.
    ctrChangePoints: Math.round((current.ctr - baseline.ctr) * 10000) / 100,
    positionChange: baseline.position !== null && current.position !== null ? Math.round((baseline.position - current.position) * 100) / 100 : null,
  };
}
