import { findBestPageMatch } from "@/lib/keywords/matching";
import { MIN_PAGE_MATCH_RELEVANCE } from "@/lib/keywords/limits";
import { CONTENT_GAP_MAX_COMPETITOR_POSITION } from "@/lib/serp/limits";
import { trafficSignalFromImpressions } from "@/lib/search-performance/scoring";
import { clamp1to5, type PageForMatching, type SearchPerformanceCandidate } from "@/lib/search-performance/types";
import type { KeywordCompetitiveSignal } from "@/lib/search-performance/detectors/competitor-shared";

/**
 * COMPETITOR_CONTENT_GAP: a DIRECT_COMPETITOR ranks well for a keyword the
 * client either doesn't rank for at all, or ranks poorly for — and has no
 * page adequately covering it (reusing Phase 2B's lexical matcher, same
 * threshold as MISSING_PAGE). Directories/marketplaces/informational/other
 * domains never trigger this — only genuine, classified competitors.
 */
export function detectCompetitorContentGaps(signals: KeywordCompetitiveSignal[], pages: PageForMatching[]): SearchPerformanceCandidate[] {
  const candidates: SearchPerformanceCandidate[] = [];

  for (const signal of signals) {
    // Client already ranks reasonably for this keyword — that's ranking-gap's territory, not a content gap.
    if (signal.clientPosition !== null && signal.clientPosition <= CONTENT_GAP_MAX_COMPETITOR_POSITION) continue;

    const bestMatch = findBestPageMatch(signal.keyword, pages);
    if (bestMatch && bestMatch.relevanceScore >= MIN_PAGE_MATCH_RELEVANCE) continue; // already adequately covered

    const bestCompetitor = signal.competitors
      .filter((c) => c.classification === "DIRECT_COMPETITOR" && c.position <= CONTENT_GAP_MAX_COMPETITOR_POSITION)
      .sort((a, b) => a.position - b.position)[0];
    if (!bestCompetitor) continue;

    const magnitude = clamp1to5(1 + ((CONTENT_GAP_MAX_COMPETITOR_POSITION - bestCompetitor.position) / (CONTENT_GAP_MAX_COMPETITOR_POSITION - 1)) * 4);

    candidates.push({
      detectorType: "COMPETITOR_CONTENT_GAP",
      keywordId: signal.keywordId,
      pageId: null,
      relatedPageId: null,
      recommendedAction: "CREATE_NEW_PAGE",
      reasoning: `"${signal.keyword}": ${bestCompetitor.domain} ranks at position ${bestCompetitor.position} (${bestCompetitor.url}) but the client has no adequately relevant page${signal.clientPosition !== null ? ` (client currently at position ${signal.clientPosition})` : " (client does not appear in this SERP at all)"}.`,
      opportunityMagnitude: magnitude,
      trafficSignal: signal.clientImpressions ? trafficSignalFromImpressions(signal.clientImpressions) : 2,
      signals: {
        competitorDomain: bestCompetitor.domain,
        competitorUrl: bestCompetitor.url,
        competitorPosition: bestCompetitor.position,
        clientPosition: signal.clientPosition,
        pageMatchRelevance: bestMatch?.relevanceScore ?? 0,
      },
    });
  }

  return candidates;
}
