/**
 * The internal competitor relevance score.
 *
 * This is NOT Google's authority/domain-rating score and does not measure
 * real domain authority, backlinks, or traffic — it's a transparent,
 * configurable weighted sum used only to rank competitor_domains rows within
 * this platform, same spirit as lib/keywords/scoring.ts and
 * lib/search-performance/scoring.ts.
 *
 * Formula:
 *
 *   score = relevantKeywordSignal * RELEVANT_KEYWORD_WEIGHT
 *         + positionStrength      * POSITION_STRENGTH_WEIGHT
 *         + appearanceFrequency   * APPEARANCE_FREQUENCY_WEIGHT
 *         + commercialCoverage    * COMMERCIAL_COVERAGE_WEIGHT
 *         + targetOverlap         * TARGET_OVERLAP_WEIGHT
 *
 * All five inputs are deterministically derived 1-5 values (see the
 * individual functions below), floored at 0 overall.
 */

export const RELEVANT_KEYWORD_WEIGHT = 1.2;
export const POSITION_STRENGTH_WEIGHT = 1.3;
export const APPEARANCE_FREQUENCY_WEIGHT = 1.0;
export const COMMERCIAL_COVERAGE_WEIGHT = 1.1;
export const TARGET_OVERLAP_WEIGHT = 1.4;

function clamp1to5(value: number): number {
  return Math.max(1, Math.min(5, Math.round(value * 100) / 100));
}

/** Log-scaled: the difference between 1 and 5 relevant keywords matters more than 50 vs 54. */
export function relevantKeywordSignal(relevantKeywordCount: number): number {
  if (relevantKeywordCount <= 0) return 1;
  return clamp1to5(1 + Math.log10(relevantKeywordCount + 1) * 2.5);
}

/** Position 1 -> 5 (strongest), decaying linearly; position 101+ clamps to 1. */
export function positionStrength(averagePosition: number | null): number {
  if (averagePosition === null) return 1;
  const clamped = Math.max(1, averagePosition);
  return clamp1to5(5 - (clamped - 1) / 25);
}

/** Log-scaled, same shape as relevantKeywordSignal. */
export function appearanceFrequency(appearances: number): number {
  if (appearances <= 0) return 1;
  return clamp1to5(1 + Math.log10(appearances + 1) * 2.5);
}

/** What fraction of this competitor's appearances were for commercial/transactional-intent keywords. */
export function commercialCoverage(commercialAppearances: number, totalAppearances: number): number {
  if (totalAppearances <= 0) return 1;
  return clamp1to5(1 + (commercialAppearances / totalAppearances) * 4);
}

/** What fraction of the client's own tracked target keywords this competitor also appears for. */
export function targetOverlap(overlapCount: number, totalClientTargetKeywords: number): number {
  if (totalClientTargetKeywords <= 0) return 1;
  return clamp1to5(1 + (overlapCount / totalClientTargetKeywords) * 4);
}

export interface CompetitorScoreInput {
  relevantKeywordCount: number;
  averagePosition: number | null;
  appearances: number;
  commercialAppearances: number;
  totalAppearances: number;
  targetKeywordOverlapCount: number;
  totalClientTargetKeywords: number;
}

export function computeCompetitorRelevanceScore(input: CompetitorScoreInput): number {
  const raw =
    relevantKeywordSignal(input.relevantKeywordCount) * RELEVANT_KEYWORD_WEIGHT +
    positionStrength(input.averagePosition) * POSITION_STRENGTH_WEIGHT +
    appearanceFrequency(input.appearances) * APPEARANCE_FREQUENCY_WEIGHT +
    commercialCoverage(input.commercialAppearances, input.totalAppearances) * COMMERCIAL_COVERAGE_WEIGHT +
    targetOverlap(input.targetKeywordOverlapCount, input.totalClientTargetKeywords) * TARGET_OVERLAP_WEIGHT;
  return Math.max(0, Math.round(raw * 100) / 100);
}
