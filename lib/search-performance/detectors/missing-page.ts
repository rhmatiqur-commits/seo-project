import { findBestPageMatch } from "@/lib/keywords/matching";
import { MIN_PAGE_MATCH_RELEVANCE } from "@/lib/keywords/limits";
import { normalizeKeyword } from "@/lib/keywords/normalize";
import { coverageGapFromPageRelevance, trafficSignalFromImpressions } from "@/lib/search-performance/scoring";
import { MIN_MEANINGFUL_IMPRESSIONS } from "@/lib/search-performance/limits";
import { clamp1to5, type PageForMatching, type SearchPerformanceCandidate } from "@/lib/search-performance/types";
import type { QueryAggregate } from "@/lib/search-performance/comparison";

export interface KeywordForMissingPage {
  id: string;
  keyword: string;
  /** Real provider search volume (lib/keywords/provider.ts), or null if none was ever collected. */
  searchVolume: number | null;
}

/**
 * MISSING_PAGE: a tracked keyword with *demand evidence* — either a real
 * provider search-volume figure, or meaningful actual Search Console
 * impressions — but no existing page adequately covers it. Demand evidence
 * is required (unlike CONTENT_GAP, which surfaces AI-judged relevance gaps
 * without requiring measured demand) so this detector never fires on a
 * keyword nobody is actually searching for.
 */
export function detectMissingPages(
  keywords: KeywordForMissingPage[],
  currentAggregateByNormalizedQuery: Map<string, QueryAggregate>,
  pages: PageForMatching[]
): SearchPerformanceCandidate[] {
  const candidates: SearchPerformanceCandidate[] = [];

  for (const keyword of keywords) {
    const bestMatch = findBestPageMatch(keyword.keyword, pages);
    if (bestMatch && bestMatch.relevanceScore >= MIN_PAGE_MATCH_RELEVANCE) continue; // adequately covered already

    const gscAgg = currentAggregateByNormalizedQuery.get(normalizeKeyword(keyword.keyword));
    const gscImpressions = gscAgg?.impressions ?? 0;
    const hasProviderDemand = keyword.searchVolume !== null && keyword.searchVolume > 0;
    const hasMeasuredDemand = gscImpressions >= MIN_MEANINGFUL_IMPRESSIONS;
    if (!hasProviderDemand && !hasMeasuredDemand) continue; // no evidence anyone is actually searching this

    const pageMatchRelevance = bestMatch?.relevanceScore ?? 0;
    const demandParts: string[] = [];
    if (hasProviderDemand) demandParts.push(`an estimated ${keyword.searchVolume}/mo search volume (provider data)`);
    if (hasMeasuredDemand) demandParts.push(`${gscImpressions} actual Search Console impressions`);

    candidates.push({
      detectorType: "MISSING_PAGE",
      keywordId: keyword.id,
      pageId: null,
      relatedPageId: null,
      recommendedAction: "CREATE_NEW_PAGE",
      reasoning: `"${keyword.keyword}" has ${demandParts.join(" and ")}, but no existing page adequately covers it${bestMatch ? ` (closest match: ${bestMatch.page.url}, relevance ${pageMatchRelevance}/100)` : ""}.`,
      opportunityMagnitude: clamp1to5(coverageGapFromPageRelevance(pageMatchRelevance)),
      trafficSignal: trafficSignalFromImpressions(Math.max(gscImpressions, keyword.searchVolume ?? 0)),
      signals: {
        searchVolume: keyword.searchVolume,
        searchVolumeSource: hasProviderDemand ? "provider" : null,
        gscImpressions,
        pageMatchRelevance,
      },
    });
  }

  return candidates;
}
