import { coverageGapFromPageRelevance } from "@/lib/keywords/scoring";
import { PROMOTION_THRESHOLD } from "@/lib/search-performance/limits";
import type { OpportunityType } from "@/lib/supabase/types";

/**
 * The internal SEO Decision Engine prioritisation score.
 *
 * This is NOT a Google ranking formula and does not predict rankings — it's
 * a transparent, configurable weighted sum used only to rank
 * search_performance_opportunities within this platform, same spirit as
 * lib/keywords/scoring.ts's computeKeywordOpportunityScore (whose
 * coverageGapFromPageRelevance() is reused directly below, not reimplemented).
 *
 * Formula:
 *
 *   score = businessRelevance    * BUSINESS_RELEVANCE_WEIGHT
 *         + commercialValue      * COMMERCIAL_VALUE_WEIGHT
 *         + opportunityMagnitude * OPPORTUNITY_MAGNITUDE_WEIGHT
 *         + trafficSignal        * TRAFFIC_SIGNAL_WEIGHT
 *         - effort               * EFFORT_PENALTY_WEIGHT
 *
 * All five inputs are on a 1-5 scale, floored at 0 overall. `businessRelevance`/
 * `commercialValue` come from an existing keyword_opportunities row when one
 * exists (Phase 2B's AI-derived judgement, reused — never a fresh AI call
 * just to score) or default to 3 (neutral) otherwise. `opportunityMagnitude`
 * and `trafficSignal` are detector-specific deterministic derivations — see
 * each file under lib/search-performance/detectors/. `effort` is a fixed
 * per-recommended-action constant (EFFORT_BY_ACTION below), not invented
 * per-opportunity.
 */

export const BUSINESS_RELEVANCE_WEIGHT = 1.5;
export const COMMERCIAL_VALUE_WEIGHT = 1.3;
export const OPPORTUNITY_MAGNITUDE_WEIGHT = 1.4;
export const TRAFFIC_SIGNAL_WEIGHT = 1.0;
export const EFFORT_PENALTY_WEIGHT = 0.8;

/** Fixed, documented effort estimate (1-5) per recommended action — not
 * AI-guessed per opportunity. Internal linking is cheapest; new content is
 * the most expensive to execute. */
export const EFFORT_BY_ACTION: Partial<Record<OpportunityType, number>> = {
  IMPROVE_INTERNAL_LINKING: 1,
  IMPROVE_CTR: 2,
  INVESTIGATE_DECLINE: 3,
  INVESTIGATE_OPPORTUNITY: 3,
  OPTIMISE_EXISTING_PAGE: 3,
  CREATE_NEW_PAGE: 4,
};
const DEFAULT_EFFORT = 3;

export function getEffortForAction(action: OpportunityType): number {
  return EFFORT_BY_ACTION[action] ?? DEFAULT_EFFORT;
}

/** Converts a raw impressions/clicks count into a 1-5 "how much attention is
 * this already getting" signal via a log scale (demand differences of 10x
 * matter more than +10 impressions at the low end). */
export function trafficSignalFromImpressions(impressions: number): number {
  if (impressions <= 0) return 1;
  const scaled = 1 + Math.log10(impressions + 1);
  return Math.max(1, Math.min(5, Math.round(scaled * 100) / 100));
}

export interface SearchPerformanceScoreInput {
  /** 1-5. From a matched keyword_opportunities row, or 3 (neutral) if none exists. */
  businessRelevance: number;
  /** 1-5. From a matched keyword_opportunities row, or 3 (neutral) if none exists. */
  commercialValue: number;
  /** 1-5. Detector-specific: how big is this particular opportunity. */
  opportunityMagnitude: number;
  /** 1-5. Derived from measured impressions/clicks via trafficSignalFromImpressions(). */
  trafficSignal: number;
  /** 1-5. Fixed per recommended_action — see getEffortForAction(). */
  effort: number;
}

export function computeSearchPerformanceScore(input: SearchPerformanceScoreInput): number {
  const raw =
    input.businessRelevance * BUSINESS_RELEVANCE_WEIGHT +
    input.commercialValue * COMMERCIAL_VALUE_WEIGHT +
    input.opportunityMagnitude * OPPORTUNITY_MAGNITUDE_WEIGHT +
    input.trafficSignal * TRAFFIC_SIGNAL_WEIGHT -
    input.effort * EFFORT_PENALTY_WEIGHT;
  return Math.max(0, Math.round(raw * 100) / 100);
}

/** Re-exported so callers needing a page-relevance-derived magnitude (e.g.
 * MISSING_PAGE/CONTENT_GAP) use the exact same coverage-gap math as Phase 2B
 * rather than a second, subtly-different implementation. */
export { coverageGapFromPageRelevance };

// --- Promotion (task-generation) policy ---

/** Only these recommended actions ever become a real seo_tasks row — matches
 * the spec exactly. INVESTIGATE_OPPORTUNITY (emerging keywords) is
 * deliberately excluded: surfaced as an opportunity, never auto-tasked. */
const PROMOTABLE_ACTIONS: ReadonlySet<OpportunityType> = new Set([
  "CREATE_NEW_PAGE",
  "OPTIMISE_EXISTING_PAGE",
  "IMPROVE_CTR",
  "INVESTIGATE_DECLINE",
  "IMPROVE_INTERNAL_LINKING",
]);

export interface PromotionCheckInput {
  recommendedAction: OpportunityType;
  opportunityScore: number;
  /** Non-null when this row has already been promoted — re-running analysis must never create a second task for it. */
  seoOpportunityId: string | null;
}

/** Pure decision: should this opportunity be promoted into seo_opportunities/
 * seo_tasks right now? Combines the action allow-list, the score threshold,
 * and "not already promoted" into one tested function (mirrors
 * lib/jobs/policy.ts's shouldEnqueue* shape). */
export function shouldPromoteSearchPerformanceOpportunity(input: PromotionCheckInput, threshold: number = PROMOTION_THRESHOLD): boolean {
  if (input.seoOpportunityId !== null) return false;
  if (!PROMOTABLE_ACTIONS.has(input.recommendedAction)) return false;
  return input.opportunityScore >= threshold;
}
