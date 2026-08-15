import { trafficSignalFromImpressions } from "@/lib/search-performance/scoring";
import { clamp1to5, type SearchPerformanceCandidate } from "@/lib/search-performance/types";
import type { SerpFeatures } from "@/lib/serp/provider";

/**
 * SERP_FEATURE_OPPORTUNITY: a high-priority keyword's SERP includes a
 * feature (featured snippet, local pack, FAQ) the client doesn't currently
 * hold. Only considered for keywords already judged high-priority elsewhere
 * (isHighPriority — e.g. lib/serp/priority-tier.ts's HIGH tier, or an
 * existing high-scoring keyword_opportunities row) so this doesn't flag
 * every keyword with any SERP feature present, which would be most of them.
 */
export interface KeywordSerpFeatureSignal {
  keyword: string;
  keywordId: string | null;
  features: SerpFeatures;
  clientHoldsFeaturedSnippet: boolean;
  clientHoldsLocalPack: boolean;
  isHighPriority: boolean;
  impressions?: number;
}

export function detectSerpFeatureOpportunities(signals: KeywordSerpFeatureSignal[]): SearchPerformanceCandidate[] {
  const candidates: SearchPerformanceCandidate[] = [];

  for (const signal of signals) {
    if (!signal.isHighPriority) continue;

    const missed: string[] = [];
    if (signal.features.featuredSnippet && !signal.clientHoldsFeaturedSnippet) missed.push("featured snippet");
    if (signal.features.localPack && !signal.clientHoldsLocalPack) missed.push("local pack");
    if (signal.features.faq) missed.push("FAQ"); // no reliable per-domain "holder" for FAQ boxes — presence alone on a high-priority keyword is the signal
    if (missed.length === 0) continue;

    candidates.push({
      detectorType: "SERP_FEATURE_OPPORTUNITY",
      keywordId: signal.keywordId,
      pageId: null,
      relatedPageId: null,
      recommendedAction: "IMPROVE_CTR",
      reasoning: `"${signal.keyword}" is a high-priority keyword whose SERP includes ${missed.join(", ")}, which the client does not currently hold — targeting it could improve visibility.`,
      opportunityMagnitude: clamp1to5(1 + missed.length),
      trafficSignal: signal.impressions ? trafficSignalFromImpressions(signal.impressions) : 2,
      signals: { features: signal.features, missedFeatures: missed },
    });
  }

  return candidates;
}
