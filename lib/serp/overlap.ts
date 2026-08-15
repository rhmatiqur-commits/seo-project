import { normalizeKeyword } from "@/lib/keywords/normalize";

/**
 * Pure keyword-overlap set operations — normalized via the existing
 * lib/keywords/normalize.ts (Phase 2B), so a keyword sourced from the
 * keyword provider and one sourced from a GSC/SERP query are recognised as
 * the same keyword regardless of case/spacing.
 */

export interface KeywordOverlapResult {
  /** Normalized keywords where both the client and the competitor appear. */
  shared: string[];
  /** Normalized keywords where the competitor appears but the client doesn't. */
  competitorOnly: string[];
  /** Normalized keywords where the client appears but the competitor doesn't. */
  clientOnly: string[];
}

export function computeKeywordOverlap(clientKeywords: string[], competitorKeywords: string[]): KeywordOverlapResult {
  const clientSet = new Set(clientKeywords.map(normalizeKeyword).filter(Boolean));
  const competitorSet = new Set(competitorKeywords.map(normalizeKeyword).filter(Boolean));

  const shared: string[] = [];
  const clientOnly: string[] = [];
  for (const keyword of clientSet) {
    if (competitorSet.has(keyword)) shared.push(keyword);
    else clientOnly.push(keyword);
  }

  const competitorOnly: string[] = [];
  for (const keyword of competitorSet) {
    if (!clientSet.has(keyword)) competitorOnly.push(keyword);
  }

  return { shared, competitorOnly, clientOnly };
}
