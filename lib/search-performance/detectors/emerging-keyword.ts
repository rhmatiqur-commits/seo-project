import { trafficSignalFromImpressions } from "@/lib/search-performance/scoring";
import { EMERGING_IMPRESSIONS_GROWTH_THRESHOLD_PCT, EMERGING_MIN_NEW_IMPRESSIONS, MIN_MEANINGFUL_IMPRESSIONS } from "@/lib/search-performance/limits";
import { clamp1to5, type SearchPerformanceCandidate } from "@/lib/search-performance/types";
import type { PeriodComparison } from "@/lib/search-performance/comparison";

/**
 * EMERGING_KEYWORD: a query that either has no previous-period presence at
 * all (genuinely new) with meaningful current impressions, or grew
 * impressions substantially vs the previous period. Surfaced for
 * investigation only — never auto-promoted to a task (see
 * lib/search-performance/scoring.ts's PROMOTABLE_ACTIONS), since "this might
 * be worth pursuing" needs a human look before committing effort.
 */
export function detectEmergingKeywords(comparisons: PeriodComparison[], keywordIdByNormalizedQuery: Map<string, string>): SearchPerformanceCandidate[] {
  const candidates: SearchPerformanceCandidate[] = [];

  for (const cmp of comparisons) {
    const qualifiesAsNew = cmp.isNew && cmp.current.impressions >= EMERGING_MIN_NEW_IMPRESSIONS;
    const qualifiesAsGrowth =
      !cmp.isNew &&
      cmp.current.impressions >= MIN_MEANINGFUL_IMPRESSIONS &&
      cmp.impressionsDeltaPct !== null &&
      cmp.impressionsDeltaPct >= EMERGING_IMPRESSIONS_GROWTH_THRESHOLD_PCT;
    if (!qualifiesAsNew && !qualifiesAsGrowth) continue;

    const magnitude = qualifiesAsNew
      ? clamp1to5(1 + (cmp.current.impressions / EMERGING_MIN_NEW_IMPRESSIONS - 1) * 2)
      : clamp1to5(1 + (cmp.impressionsDeltaPct! / EMERGING_IMPRESSIONS_GROWTH_THRESHOLD_PCT - 1) * 2);

    const reasoning = qualifiesAsNew
      ? `"${cmp.originalQuery}" is a newly-appearing query with ${cmp.current.impressions} impressions in the current period (no prior presence).`
      : `"${cmp.originalQuery}" impressions grew ${cmp.impressionsDeltaPct}% vs the previous period (${cmp.previous!.impressions} -> ${cmp.current.impressions}).`;

    candidates.push({
      detectorType: "EMERGING_KEYWORD",
      keywordId: keywordIdByNormalizedQuery.get(cmp.normalizedQuery) ?? null,
      pageId: null,
      relatedPageId: null,
      recommendedAction: "INVESTIGATE_OPPORTUNITY",
      reasoning,
      opportunityMagnitude: magnitude,
      trafficSignal: trafficSignalFromImpressions(cmp.current.impressions),
      signals: {
        isNew: cmp.isNew,
        currentImpressions: cmp.current.impressions,
        previousImpressions: cmp.previous?.impressions ?? null,
        impressionsDeltaPct: cmp.impressionsDeltaPct,
        currentPosition: cmp.current.position,
      },
    });
  }

  return candidates;
}
