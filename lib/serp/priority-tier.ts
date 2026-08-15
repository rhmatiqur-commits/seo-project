import {
  SERP_REFETCH_DAYS_HIGH,
  SERP_REFETCH_DAYS_MEDIUM,
  SERP_REFETCH_DAYS_LOW,
  HIGH_PRIORITY_KEYWORD_SCORE_THRESHOLD,
  MEDIUM_PRIORITY_KEYWORD_SCORE_THRESHOLD,
  HIGH_PRIORITY_IMPRESSIONS_THRESHOLD,
  MEDIUM_PRIORITY_IMPRESSIONS_THRESHOLD,
} from "@/lib/serp/limits";

/**
 * Tiered per-keyword SERP-refetch cadence, entirely in application logic —
 * "don't over-engineer the scheduler." One website-level schedule
 * (websites.next_serp_fetch_at) triggers FETCH_SERP_RESULTS; this module
 * decides, per keyword, whether it's actually due given its own tier.
 */

export type SerpPriorityTier = "HIGH" | "MEDIUM" | "LOW";

export interface SerpPriorityInput {
  /** From a matched keyword_opportunities row, or null if none exists. */
  keywordOpportunityScore: number | null;
  /** True if an existing PAGE_TWO_OPPORTUNITY search_performance_opportunities row exists for this keyword. */
  hasPageTwoOpportunity: boolean;
  /** Recent (comparison-window) aggregated GSC impressions for this keyword, 0 if none. */
  recentImpressions: number;
}

export function getSerpPriorityTier(input: SerpPriorityInput): SerpPriorityTier {
  const score = input.keywordOpportunityScore ?? 0;
  if (score >= HIGH_PRIORITY_KEYWORD_SCORE_THRESHOLD || input.hasPageTwoOpportunity || input.recentImpressions >= HIGH_PRIORITY_IMPRESSIONS_THRESHOLD) {
    return "HIGH";
  }
  if (score >= MEDIUM_PRIORITY_KEYWORD_SCORE_THRESHOLD || input.recentImpressions >= MEDIUM_PRIORITY_IMPRESSIONS_THRESHOLD) {
    return "MEDIUM";
  }
  return "LOW";
}

export function getSerpRefetchDays(tier: SerpPriorityTier): number {
  switch (tier) {
    case "HIGH":
      return SERP_REFETCH_DAYS_HIGH;
    case "MEDIUM":
      return SERP_REFETCH_DAYS_MEDIUM;
    default:
      return SERP_REFETCH_DAYS_LOW;
  }
}

/** True if this keyword hasn't been SERP-fetched yet, or its tier's refetch
 * window has elapsed since the last fetch — the actual "avoid duplicate SERP
 * runs" check. */
export function isKeywordDueForSerpFetch(tier: SerpPriorityTier, lastSearchedAt: string | null, now: Date): boolean {
  if (!lastSearchedAt) return true;
  const refetchMs = getSerpRefetchDays(tier) * 24 * 60 * 60 * 1000;
  return now.getTime() - new Date(lastSearchedAt).getTime() >= refetchMs;
}
