/**
 * The internal keyword-opportunity prioritisation score.
 *
 * This is NOT a Google ranking formula and does not predict rankings — it's
 * a transparent, configurable weighted sum used only to sort/prioritise
 * keyword opportunities within this platform. Every input is either an
 * AI-derived 1-5 judgement (business relevance, commercial value, difficulty)
 * or a fact already in the database (existing page relevance) — never
 * invented search volume/CPC/competition (see lib/keywords/provider.ts).
 *
 * Formula (mirrors the shape of priorityScore() in lib/ai/seo-analysis.ts):
 *
 *   score = businessRelevance * BUSINESS_RELEVANCE_WEIGHT
 *         + commercialValue   * COMMERCIAL_VALUE_WEIGHT
 *         + coverageGap       * COVERAGE_GAP_WEIGHT
 *         - difficulty        * DIFFICULTY_PENALTY_WEIGHT
 *
 * where `coverageGap` (1-5) is derived from how well an existing page already
 * covers the keyword: no matching page (relevance 0) is the maximum gap (5);
 * a near-perfect existing match (relevance 100) is the minimum gap (0).
 * Weights are named constants specifically so they're easy to retune.
 */

export const BUSINESS_RELEVANCE_WEIGHT = 1.5;
export const COMMERCIAL_VALUE_WEIGHT = 1.3;
export const COVERAGE_GAP_WEIGHT = 1.2;
export const DIFFICULTY_PENALTY_WEIGHT = 1.0;

export interface KeywordOpportunityScoreInput {
  /** 1-5, AI-derived: how relevant this keyword is to the business. */
  businessRelevance: number;
  /** 1-5, AI-derived: commercial/conversion potential. */
  commercialValue: number;
  /** 1-5, AI-estimated internal judgement — not a real keyword-difficulty metric. */
  difficulty: number;
  /** 0-100, from lib/keywords/matching.ts — 0 when no existing page matches. */
  existingPageRelevance: number;
}

/** Maps a 0-100 existing-page-relevance score onto a 1-5 coverage-gap value
 * (inverted: less existing coverage = bigger gap = higher opportunity). */
export function coverageGapFromPageRelevance(existingPageRelevance: number): number {
  const clamped = Math.max(0, Math.min(100, existingPageRelevance));
  return Math.round(((100 - clamped) / 100) * 5 * 100) / 100;
}

export function computeKeywordOpportunityScore(input: KeywordOpportunityScoreInput): number {
  const coverageGap = coverageGapFromPageRelevance(input.existingPageRelevance);
  const raw =
    input.businessRelevance * BUSINESS_RELEVANCE_WEIGHT +
    input.commercialValue * COMMERCIAL_VALUE_WEIGHT +
    coverageGap * COVERAGE_GAP_WEIGHT -
    input.difficulty * DIFFICULTY_PENALTY_WEIGHT;
  return Math.max(0, Math.round(raw * 100) / 100);
}
