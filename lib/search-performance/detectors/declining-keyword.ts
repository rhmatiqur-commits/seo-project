import { trafficSignalFromImpressions } from "@/lib/search-performance/scoring";
import { DECLINE_CLICKS_THRESHOLD_PCT, DECLINE_IMPRESSIONS_THRESHOLD_PCT, DECLINE_POSITION_THRESHOLD, MIN_BASELINE_IMPRESSIONS_FOR_COMPARISON } from "@/lib/search-performance/limits";
import { clamp1to5, type SearchPerformanceCandidate } from "@/lib/search-performance/types";
import type { PeriodComparison } from "@/lib/search-performance/comparison";

/**
 * DECLINING_KEYWORD: a meaningful drop in clicks, impressions, or average
 * position vs the previous comparison period. Requires a minimum previous-
 * period baseline (MIN_BASELINE_IMPRESSIONS_FOR_COMPARISON) so a query going
 * from 1 click to 0 doesn't register as a "decline" — that's noise, not signal.
 */
export function detectDecliningKeywords(comparisons: PeriodComparison[], keywordIdByNormalizedQuery: Map<string, string>): SearchPerformanceCandidate[] {
  const candidates: SearchPerformanceCandidate[] = [];

  for (const cmp of comparisons) {
    if (cmp.isNew || !cmp.previous) continue;
    if (cmp.previous.impressions < MIN_BASELINE_IMPRESSIONS_FOR_COMPARISON) continue;

    const clicksDeclined = cmp.clicksDeltaPct !== null && cmp.clicksDeltaPct <= -DECLINE_CLICKS_THRESHOLD_PCT;
    const impressionsDeclined = cmp.impressionsDeltaPct !== null && cmp.impressionsDeltaPct <= -DECLINE_IMPRESSIONS_THRESHOLD_PCT;
    const positionWorsened = cmp.positionDelta !== null && cmp.positionDelta >= DECLINE_POSITION_THRESHOLD;
    if (!clicksDeclined && !impressionsDeclined && !positionWorsened) continue;

    const reasons: string[] = [];
    if (clicksDeclined) reasons.push(`clicks down ${Math.abs(cmp.clicksDeltaPct!)}%`);
    if (impressionsDeclined) reasons.push(`impressions down ${Math.abs(cmp.impressionsDeltaPct!)}%`);
    if (positionWorsened) reasons.push(`average position worsened by ${cmp.positionDelta} spots`);

    // Magnitude scales with the worst of the three excesses past its threshold.
    const excesses = [
      clicksDeclined ? Math.abs(cmp.clicksDeltaPct!) / DECLINE_CLICKS_THRESHOLD_PCT : 0,
      impressionsDeclined ? Math.abs(cmp.impressionsDeltaPct!) / DECLINE_IMPRESSIONS_THRESHOLD_PCT : 0,
      positionWorsened ? cmp.positionDelta! / DECLINE_POSITION_THRESHOLD : 0,
    ];
    const magnitude = clamp1to5(1 + (Math.max(...excesses) - 1) * 2);

    candidates.push({
      detectorType: "DECLINING_KEYWORD",
      keywordId: keywordIdByNormalizedQuery.get(cmp.normalizedQuery) ?? null,
      pageId: null,
      relatedPageId: null,
      recommendedAction: "INVESTIGATE_DECLINE",
      reasoning: `"${cmp.originalQuery}" is declining vs the previous period: ${reasons.join(", ")}.`,
      opportunityMagnitude: magnitude,
      trafficSignal: trafficSignalFromImpressions(cmp.previous.impressions),
      signals: {
        currentClicks: cmp.current.clicks,
        previousClicks: cmp.previous.clicks,
        currentImpressions: cmp.current.impressions,
        previousImpressions: cmp.previous.impressions,
        currentPosition: cmp.current.position,
        previousPosition: cmp.previous.position,
        clicksDeltaPct: cmp.clicksDeltaPct,
        impressionsDeltaPct: cmp.impressionsDeltaPct,
        positionDelta: cmp.positionDelta,
      },
    });
  }

  return candidates;
}
