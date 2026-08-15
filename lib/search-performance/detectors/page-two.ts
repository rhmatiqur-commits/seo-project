import { findBestPageMatch } from "@/lib/keywords/matching";
import { MIN_PAGE_MATCH_RELEVANCE } from "@/lib/keywords/limits";
import { trafficSignalFromImpressions } from "@/lib/search-performance/scoring";
import { PAGE_TWO_MIN_POSITION, PAGE_TWO_MAX_POSITION, MIN_MEANINGFUL_IMPRESSIONS } from "@/lib/search-performance/limits";
import { clamp1to5, type PageForMatching, type SearchPerformanceCandidate } from "@/lib/search-performance/types";
import type { QueryAggregate } from "@/lib/search-performance/comparison";

/**
 * PAGE_TWO_OPPORTUNITY: queries ranking roughly position 11-20 ("page two")
 * with meaningful impressions where an existing page already reasonably
 * covers the topic — the classic "close, optimise, don't rebuild" case.
 * Position/impressions are real Search Console measurements; the "appropriate
 * existing page exists" check reuses Phase 2B's lexical matcher as-is.
 */
export function detectPageTwoOpportunities(
  currentAggregates: QueryAggregate[],
  keywordIdByNormalizedQuery: Map<string, string>,
  pages: PageForMatching[]
): SearchPerformanceCandidate[] {
  const candidates: SearchPerformanceCandidate[] = [];

  for (const agg of currentAggregates) {
    if (agg.position === null) continue;
    if (agg.position < PAGE_TWO_MIN_POSITION || agg.position > PAGE_TWO_MAX_POSITION) continue;
    if (agg.impressions < MIN_MEANINGFUL_IMPRESSIONS) continue;

    const bestMatch = findBestPageMatch(agg.originalQuery, pages);
    if (!bestMatch || bestMatch.relevanceScore < MIN_PAGE_MATCH_RELEVANCE) continue; // no appropriate existing page -> not this detector

    // Closer to breaking onto page one (position 11) = bigger opportunity than languishing at position 20.
    const magnitude = clamp1to5(1 + ((PAGE_TWO_MAX_POSITION - agg.position) / (PAGE_TWO_MAX_POSITION - PAGE_TWO_MIN_POSITION)) * 4);

    candidates.push({
      detectorType: "PAGE_TWO_OPPORTUNITY",
      keywordId: keywordIdByNormalizedQuery.get(agg.normalizedQuery) ?? null,
      pageId: (bestMatch.page as PageForMatching).id,
      relatedPageId: null,
      recommendedAction: "OPTIMISE_EXISTING_PAGE",
      reasoning: `"${agg.originalQuery}" ranks at position ${agg.position} (page two) with ${agg.impressions} impressions; ${bestMatch.page.url} already covers this topic (relevance ${bestMatch.relevanceScore}/100) — optimising it could push this onto page one.`,
      opportunityMagnitude: magnitude,
      trafficSignal: trafficSignalFromImpressions(agg.impressions),
      signals: {
        position: agg.position,
        impressions: agg.impressions,
        clicks: agg.clicks,
        ctr: agg.ctr,
        pageMatchRelevance: bestMatch.relevanceScore,
        pageUrl: bestMatch.page.url,
      },
    });
  }

  return candidates;
}
