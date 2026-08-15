import { findBestPageMatch } from "@/lib/keywords/matching";
import { RANKING_GAP_MIN_POSITION_DIFFERENCE } from "@/lib/serp/limits";
import { trafficSignalFromImpressions } from "@/lib/search-performance/scoring";
import { clamp1to5, type PageForMatching, type SearchPerformanceCandidate } from "@/lib/search-performance/types";
import type { KeywordCompetitiveSignal } from "@/lib/search-performance/detectors/competitor-shared";

/**
 * COMPETITOR_RANKING_GAP: both the client and a DIRECT_COMPETITOR rank for
 * the same keyword, but the competitor substantially outranks the client
 * (>= RANKING_GAP_MIN_POSITION_DIFFERENCE positions better). Never assumes
 * copying the competitor's content will close the gap — the reasoning
 * states the measured fact only; content direction is left to the (optional)
 * AI interpretation pass, which itself is bound by the same "no invented
 * claims" rule.
 */
export function detectCompetitorRankingGaps(
  signals: KeywordCompetitiveSignal[],
  pages: PageForMatching[],
  pageIdByUrl: Map<string, string>
): SearchPerformanceCandidate[] {
  const candidates: SearchPerformanceCandidate[] = [];

  for (const signal of signals) {
    if (signal.clientPosition === null) continue; // client doesn't rank at all here — that's content-gap's territory

    const bestCompetitor = signal.competitors
      .filter((c) => c.classification === "DIRECT_COMPETITOR" && signal.clientPosition! - c.position >= RANKING_GAP_MIN_POSITION_DIFFERENCE)
      .sort((a, b) => a.position - b.position)[0];
    if (!bestCompetitor) continue;

    const gap = signal.clientPosition - bestCompetitor.position;
    const magnitude = clamp1to5(1 + (gap / 20) * 4);

    const bestMatch = findBestPageMatch(signal.keyword, pages);
    const pageId = bestMatch ? (pageIdByUrl.get(bestMatch.page.url) ?? null) : null;

    candidates.push({
      detectorType: "COMPETITOR_RANKING_GAP",
      keywordId: signal.keywordId,
      pageId,
      relatedPageId: null,
      recommendedAction: "OPTIMISE_EXISTING_PAGE",
      reasoning: `"${signal.keyword}": client ranks at position ${signal.clientPosition}, while ${bestCompetitor.domain} ranks at position ${bestCompetitor.position} (${bestCompetitor.url}) — a ${gap}-position gap.`,
      opportunityMagnitude: magnitude,
      trafficSignal: signal.clientImpressions ? trafficSignalFromImpressions(signal.clientImpressions) : 2,
      signals: {
        clientPosition: signal.clientPosition,
        competitorPosition: bestCompetitor.position,
        competitorDomain: bestCompetitor.domain,
        competitorUrl: bestCompetitor.url,
        positionGap: gap,
      },
    });
  }

  return candidates;
}
