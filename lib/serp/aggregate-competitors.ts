import { classifyCompetitorDomain } from "@/lib/serp/classify-domain";
import { computeCompetitorRelevanceScore } from "@/lib/serp/competitor-scoring";
import type { CompetitorClassification } from "@/lib/supabase/types";

/**
 * Pure aggregation: raw (non-client) serp_results rows -> one row per
 * competitor domain with classification + the documented relevance score.
 * No DB access — the caller (lib/jobs/handlers/analyse-competitors.ts) does
 * the fetching; this just reduces already-fetched rows.
 */
export interface CompetitorResultRow {
  domain: string;
  keywordId: string | null;
  position: number;
  isCommercialKeyword: boolean;
}

export interface AggregatedCompetitor {
  domain: string;
  appearances: number;
  averagePosition: number;
  relevantKeywordCount: number;
  commercialAppearances: number;
  classification: CompetitorClassification;
  relevanceScore: number;
}

export function aggregateCompetitorDomains(rows: CompetitorResultRow[], clientTargetKeywordIds: Set<string>): AggregatedCompetitor[] {
  const byDomain = new Map<string, { positions: number[]; keywordIds: Set<string>; commercial: number; overlapKeywordIds: Set<string> }>();

  for (const row of rows) {
    let entry = byDomain.get(row.domain);
    if (!entry) {
      entry = { positions: [], keywordIds: new Set(), commercial: 0, overlapKeywordIds: new Set() };
      byDomain.set(row.domain, entry);
    }
    entry.positions.push(row.position);
    if (row.keywordId) {
      entry.keywordIds.add(row.keywordId);
      if (clientTargetKeywordIds.has(row.keywordId)) entry.overlapKeywordIds.add(row.keywordId);
    }
    if (row.isCommercialKeyword) entry.commercial++;
  }

  const results: AggregatedCompetitor[] = [];
  for (const [domain, entry] of byDomain) {
    const appearances = entry.positions.length;
    const averagePosition = Math.round((entry.positions.reduce((a, b) => a + b, 0) / appearances) * 100) / 100;
    const relevantKeywordCount = entry.keywordIds.size;
    const classification = classifyCompetitorDomain(domain, relevantKeywordCount);
    const relevanceScore = computeCompetitorRelevanceScore({
      relevantKeywordCount,
      averagePosition,
      appearances,
      commercialAppearances: entry.commercial,
      totalAppearances: appearances,
      targetKeywordOverlapCount: entry.overlapKeywordIds.size,
      totalClientTargetKeywords: clientTargetKeywordIds.size,
    });
    results.push({ domain, appearances, averagePosition, relevantKeywordCount, commercialAppearances: entry.commercial, classification, relevanceScore });
  }

  return results.sort((a, b) => b.relevanceScore - a.relevanceScore);
}
