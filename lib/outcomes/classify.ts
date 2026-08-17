import { MIN_IMPRESSIONS_FOR_COMPARISON, MEANINGFUL_TRAFFIC_CHANGE_PCT, MEANINGFUL_POSITION_CHANGE } from "@/lib/outcomes/limits";
import type { WindowMetrics, OutcomeDeltas } from "@/lib/outcomes/types";
import type { OutcomeClassification } from "@/lib/supabase/types";

/**
 * Deterministic minimum-data gate (spec section 7) — computed and applied
 * BEFORE classification/AI interpretation, and never overridable: the AI
 * interpretation schema (lib/ai/schemas.ts's actionOutcomeInterpretation*)
 * has no field that could contradict this, mirroring how
 * search_performance_opportunities keeps AI output additive-only.
 */
export interface DataSufficiencyResult {
  sufficient: boolean;
  reason: string;
}

/**
 * For an existing page/keyword, both periods need meaningful impressions to
 * compare — a baseline with almost no visibility makes any "improvement"
 * meaningless noise. For a brand-new page with no baseline period at all,
 * meaningful *current*-period impressions are sufficient on their own (there
 * is nothing to compare against, but that's not the same as "no evidence").
 */
export function assessDataSufficiency(baseline: WindowMetrics, current: WindowMetrics, isNewPage: boolean): DataSufficiencyResult {
  if (isNewPage) {
    if (current.impressions < MIN_IMPRESSIONS_FOR_COMPARISON) {
      return {
        sufficient: false,
        reason: `New page has ${current.impressions} impressions so far (fewer than ${MIN_IMPRESSIONS_FOR_COMPARISON}) — too early to assess.`,
      };
    }
    return { sufficient: true, reason: "New page has enough current-period impressions to assess." };
  }
  if (baseline.impressions < MIN_IMPRESSIONS_FOR_COMPARISON || current.impressions < MIN_IMPRESSIONS_FOR_COMPARISON) {
    return {
      sufficient: false,
      reason: `Fewer than ${MIN_IMPRESSIONS_FOR_COMPARISON} impressions in the baseline (${baseline.impressions}) or current (${current.impressions}) period — a comparison would be noise.`,
    };
  }
  return { sufficient: true, reason: "Both the baseline and current period have enough impressions to compare." };
}

export interface ClassificationResult {
  classification: OutcomeClassification;
  reasoning: string;
}

interface Signals {
  clicksUp: boolean;
  clicksDown: boolean;
  impressionsUp: boolean;
  impressionsDown: boolean;
  positionImproved: boolean;
  positionDeclined: boolean;
}

function computeSignals(deltas: OutcomeDeltas): Signals {
  return {
    clicksUp: deltas.clicksChangePct !== null && deltas.clicksChangePct >= MEANINGFUL_TRAFFIC_CHANGE_PCT,
    clicksDown: deltas.clicksChangePct !== null && deltas.clicksChangePct <= -MEANINGFUL_TRAFFIC_CHANGE_PCT,
    impressionsUp: deltas.impressionsChangePct !== null && deltas.impressionsChangePct >= MEANINGFUL_TRAFFIC_CHANGE_PCT,
    impressionsDown: deltas.impressionsChangePct !== null && deltas.impressionsChangePct <= -MEANINGFUL_TRAFFIC_CHANGE_PCT,
    positionImproved: deltas.positionChange !== null && deltas.positionChange >= MEANINGFUL_POSITION_CHANGE,
    positionDeclined: deltas.positionChange !== null && deltas.positionChange <= -MEANINGFUL_POSITION_CHANGE,
  };
}

function describe(baseline: WindowMetrics, current: WindowMetrics, deltas: OutcomeDeltas): string {
  const parts: string[] = [];
  if (deltas.clicksChangePct !== null) parts.push(`clicks ${deltas.clicksChangePct >= 0 ? "+" : ""}${deltas.clicksChangePct}% (${baseline.clicks} -> ${current.clicks})`);
  if (deltas.impressionsChangePct !== null) parts.push(`impressions ${deltas.impressionsChangePct >= 0 ? "+" : ""}${deltas.impressionsChangePct}% (${baseline.impressions} -> ${current.impressions})`);
  if (deltas.positionChange !== null && baseline.position !== null && current.position !== null) {
    parts.push(`position ${baseline.position} -> ${current.position} (${deltas.positionChange >= 0 ? "improved" : "declined"} by ${Math.abs(deltas.positionChange)})`);
  }
  return parts.join(", ") || "no comparable metrics available";
}

/**
 * Deterministic outcome classification (spec section 6) — never decided by a
 * single metric. Clicks/impressions and position are each independently
 * evaluated against a "meaningful movement" threshold; POSITIVE/NEGATIVE
 * require every meaningfully-moved metric to agree in direction, and any
 * real disagreement (e.g. clicks up, position down) is MIXED — never
 * auto-POSITIVE just because one metric improved. Uses cautious, observed-
 * change language throughout ("Position improved from X to Y following
 * publication"), never a causal claim.
 */
export function classifyOutcome(baseline: WindowMetrics, current: WindowMetrics, deltas: OutcomeDeltas, sufficiency: DataSufficiencyResult): ClassificationResult {
  if (!sufficiency.sufficient) {
    return { classification: "INSUFFICIENT_DATA", reasoning: sufficiency.reason };
  }

  const signals = computeSignals(deltas);
  const positiveSignals = [signals.clicksUp, signals.impressionsUp, signals.positionImproved].filter(Boolean).length;
  const negativeSignals = [signals.clicksDown, signals.impressionsDown, signals.positionDeclined].filter(Boolean).length;
  const observed = describe(baseline, current, deltas);

  if (positiveSignals === 0 && negativeSignals === 0) {
    return { classification: "INCONCLUSIVE", reasoning: `No metric moved by a meaningful amount in either direction following the action (observed: ${observed}).` };
  }
  if (positiveSignals > 0 && negativeSignals > 0) {
    return { classification: "MIXED", reasoning: `Some metrics improved and others declined following the action (observed: ${observed}) — this is a mixed result, not a clear success or failure.` };
  }
  if (positiveSignals > 0) {
    return { classification: "POSITIVE", reasoning: `Observed change following the action: ${observed}.` };
  }
  return { classification: "NEGATIVE", reasoning: `Observed change following the action: ${observed}.` };
}
