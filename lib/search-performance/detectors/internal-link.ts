import { scorePageMatch } from "@/lib/keywords/matching";
import { MIN_PAGE_MATCH_RELEVANCE } from "@/lib/keywords/limits";
import { MAX_INTERNAL_LINK_SOURCES_PER_KEYWORD } from "@/lib/search-performance/limits";
import { clamp1to5, type PageForMatching, type SearchPerformanceCandidate } from "@/lib/search-performance/types";

export interface KeywordForInternalLink {
  id: string;
  keyword: string;
}

/** `${sourcePageId}->${targetPageId}` for every existing internal link — see
 * lib/db/search-performance.ts's builder for how this set is assembled from
 * page_links. */
export type ExistingLinkSet = ReadonlySet<string>;

/**
 * INTERNAL_LINK_OPPORTUNITY: for each keyword, finds the page that best
 * represents it (the "target") and any other decently-relevant pages that
 * don't yet link to it (candidate "sources"). Bounded to the top
 * MAX_INTERNAL_LINK_SOURCES_PER_KEYWORD candidates per keyword, and only
 * pages clearing the same lexical-relevance bar Phase 2B uses elsewhere —
 * "do not create links blindly" means a topical basis is required, not a
 * blanket link-everything-to-everything suggestion.
 */
export function detectInternalLinkOpportunities(
  keywords: KeywordForInternalLink[],
  pages: PageForMatching[],
  existingLinks: ExistingLinkSet
): SearchPerformanceCandidate[] {
  const candidates: SearchPerformanceCandidate[] = [];

  for (const keyword of keywords) {
    const scored = pages
      .map((page) => ({ page, ...scorePageMatch(keyword.keyword, page) }))
      .filter((m) => m.matchType !== "none" && m.relevanceScore >= MIN_PAGE_MATCH_RELEVANCE)
      .sort((a, b) => b.relevanceScore - a.relevanceScore);

    if (scored.length < 2) continue; // need both a target and at least one candidate source

    const target = scored[0]!;
    const sources = scored.slice(1, 1 + MAX_INTERNAL_LINK_SOURCES_PER_KEYWORD);

    for (const source of sources) {
      const linkKey = `${source.page.id}->${target.page.id}`;
      if (existingLinks.has(linkKey)) continue; // already linked, nothing to suggest

      candidates.push({
        detectorType: "INTERNAL_LINK_OPPORTUNITY",
        keywordId: keyword.id,
        pageId: target.page.id,
        relatedPageId: source.page.id,
        recommendedAction: "IMPROVE_INTERNAL_LINKING",
        reasoning: `"${source.page.url}" is topically relevant to "${keyword.keyword}" (relevance ${source.relevanceScore}/100) but does not yet link to "${target.page.url}", the page that best covers this keyword (relevance ${target.relevanceScore}/100).`,
        opportunityMagnitude: clamp1to5(1 + (source.relevanceScore / 100) * 4),
        // Not GSC-driven — a fixed, documented neutral value.
        trafficSignal: 2,
        signals: {
          keyword: keyword.keyword,
          targetPageUrl: target.page.url,
          sourcePageUrl: source.page.url,
          targetRelevance: target.relevanceScore,
          sourceRelevance: source.relevanceScore,
        },
      });
    }
  }

  return candidates;
}
