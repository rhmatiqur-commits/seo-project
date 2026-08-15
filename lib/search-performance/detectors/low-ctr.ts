import { ctrGapPercent, getExpectedCtrForPosition } from "@/lib/search-performance/expected-ctr";
import { trafficSignalFromImpressions } from "@/lib/search-performance/scoring";
import { LOW_CTR_GAP_THRESHOLD_PCT, MIN_MEANINGFUL_IMPRESSIONS } from "@/lib/search-performance/limits";
import { clamp1to5, type PageForMatching, type SearchPerformanceCandidate } from "@/lib/search-performance/types";
import type { QueryAggregate } from "@/lib/search-performance/comparison";

/**
 * HIGH_IMPRESSIONS_LOW_CTR: queries with meaningful impressions whose actual
 * CTR falls well short of lib/search-performance/expected-ctr.ts's internal
 * benchmark for their position — a signal that the *listing* (title/meta/
 * relevance to intent), not the ranking itself, is underperforming. Does not
 * modify any content — surfaces the finding only.
 */
export function detectHighImpressionsLowCtr(
  currentAggregates: QueryAggregate[],
  keywordIdByNormalizedQuery: Map<string, string>,
  pageIdByUrl: Map<string, string>
): SearchPerformanceCandidate[] {
  const candidates: SearchPerformanceCandidate[] = [];

  for (const agg of currentAggregates) {
    if (agg.position === null) continue;
    if (agg.impressions < MIN_MEANINGFUL_IMPRESSIONS) continue;

    const gap = ctrGapPercent(agg.ctr, agg.position);
    if (gap < LOW_CTR_GAP_THRESHOLD_PCT) continue;

    const pageId = agg.topPageUrl ? (pageIdByUrl.get(agg.topPageUrl) ?? null) : null;
    const expectedCtr = getExpectedCtrForPosition(agg.position);

    candidates.push({
      detectorType: "HIGH_IMPRESSIONS_LOW_CTR",
      keywordId: keywordIdByNormalizedQuery.get(agg.normalizedQuery) ?? null,
      pageId,
      relatedPageId: null,
      recommendedAction: "IMPROVE_CTR",
      reasoning: `"${agg.originalQuery}" gets ${agg.impressions} impressions at position ${agg.position} but only a ${(agg.ctr * 100).toFixed(2)}% CTR — about ${gap}% below our internal expected-CTR benchmark (${(expectedCtr * 100).toFixed(2)}%) for that position. Consider the title, meta description, or whether the result actually matches search intent.`,
      opportunityMagnitude: clamp1to5(1 + (gap / 100) * 4),
      trafficSignal: trafficSignalFromImpressions(agg.impressions),
      signals: {
        position: agg.position,
        impressions: agg.impressions,
        clicks: agg.clicks,
        actualCtr: agg.ctr,
        expectedCtr,
        ctrGapPercent: gap,
        pageUrl: agg.topPageUrl,
      },
    });
  }

  return candidates;
}
