import type { CompetitorClassification } from "@/lib/supabase/types";

/** Shared input shape for the two SERP-driven competitor detectors — one
 * row per keyword, with the client's own position (if any) and every
 * qualifying competitor's position for the same keyword. Built by the job
 * handler from the latest serp_run's serp_results joined with
 * competitor_domains classification. */
export interface CompetitorRankingEntry {
  domain: string;
  classification: CompetitorClassification;
  position: number;
  url: string;
  pageTitle: string | null;
}

export interface KeywordCompetitiveSignal {
  keyword: string;
  keywordId: string | null;
  /** Null means the client doesn't appear in this keyword's SERP at all. */
  clientPosition: number | null;
  /** Recent GSC impressions for this keyword, if known — used for the traffic signal, never fabricated. */
  clientImpressions?: number;
  competitors: CompetitorRankingEntry[];
}
