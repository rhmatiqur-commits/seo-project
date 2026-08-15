import type { SearchPerformanceDetectorType, OpportunityType } from "@/lib/supabase/types";
import type { MatchablePage } from "@/lib/keywords/matching";

/** lib/keywords/matching.ts's MatchablePage plus the DB id every detector
 * needs to actually reference a page. */
export interface PageForMatching extends MatchablePage {
  id: string;
}

/**
 * What every detector returns — deliberately does NOT include
 * businessRelevance/commercialValue/effort/opportunityScore. Those are
 * filled in uniformly by the job handler (looked up from a matching
 * keyword_opportunities row, or defaulted) so every detector scores through
 * the exact same formula (lib/search-performance/scoring.ts) rather than
 * each computing its own final number.
 */
export interface SearchPerformanceCandidate {
  detectorType: SearchPerformanceDetectorType;
  keywordId: string | null;
  pageId: string | null;
  relatedPageId: string | null;
  recommendedAction: OpportunityType;
  /** Deterministic, human-readable — filled immediately, never depends on AI. */
  reasoning: string;
  /** 1-5, detector-specific "how big is this opportunity". */
  opportunityMagnitude: number;
  /** 1-5, derived from measured impressions/clicks (or a neutral default for non-GSC detectors). */
  trafficSignal: number;
  /** Measured/deterministic inputs snapshot, stored as-is in the DB for transparency. */
  signals: Record<string, unknown>;
}

export function clamp1to5(value: number): number {
  return Math.max(1, Math.min(5, Math.round(value * 100) / 100));
}
