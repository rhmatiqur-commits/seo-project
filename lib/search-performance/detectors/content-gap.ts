import { coverageGapFromPageRelevance } from "@/lib/search-performance/scoring";
import { clamp1to5, type SearchPerformanceCandidate } from "@/lib/search-performance/types";
import type { OpportunityType } from "@/lib/supabase/types";

/** Deliberately a small, decoupled shape (not the full DB row) so this
 * module stays a pure function with no dependency on lib/db/*. */
export interface KeywordOpportunityForContentGap {
  id: string;
  keywordId: string;
  keyword: string;
  opportunityType: OpportunityType;
  currentPageId: string | null;
  businessRelevanceScore: number | null;
  commercialValueScore: number | null;
  /** Non-null if Phase 2B's own keyword-discovery pipeline already promoted this — skip re-surfacing it. */
  seoOpportunityId: string | null;
}

/**
 * CONTENT_GAP: re-surfaces existing Phase 2B keyword_opportunities rows
 * (AI-judged business/commercial relevance, `CREATE_NEW_PAGE`, no matching
 * page) under the unified detector/scoring model — no second AI-scoring
 * pass, genuine reuse. Distinct from MISSING_PAGE: this doesn't require
 * measured search demand, only AI-judged relevance to the business.
 */
export function detectContentGaps(rows: KeywordOpportunityForContentGap[]): SearchPerformanceCandidate[] {
  const candidates: SearchPerformanceCandidate[] = [];

  for (const row of rows) {
    if (row.opportunityType !== "CREATE_NEW_PAGE") continue;
    if (row.currentPageId !== null) continue;
    if (row.seoOpportunityId !== null) continue; // already promoted once, don't resurrect it as a duplicate feeder

    candidates.push({
      detectorType: "CONTENT_GAP",
      keywordId: row.keywordId,
      pageId: null,
      relatedPageId: null,
      recommendedAction: "CREATE_NEW_PAGE",
      reasoning: `"${row.keyword}" was AI-classified as business/commercially relevant (business relevance ${row.businessRelevanceScore ?? "n/a"}/5, commercial value ${row.commercialValueScore ?? "n/a"}/5) with no existing page covering it — surfaced via keyword discovery, no measured search demand required.`,
      opportunityMagnitude: clamp1to5(coverageGapFromPageRelevance(0)), // no current page at all -> maximum coverage gap
      // No GSC/provider demand signal backs this detector by design — a
      // fixed, documented neutral value, not a fabricated traffic estimate.
      trafficSignal: 2,
      signals: {
        source: "keyword_opportunities",
        keywordOpportunityId: row.id,
        businessRelevanceScore: row.businessRelevanceScore,
        commercialValueScore: row.commercialValueScore,
      },
    });
  }

  return candidates;
}
