import type { SearchPerformanceDetectorType } from "@/lib/supabase/types";

/**
 * Deterministic identity for a search_performance_opportunities row. Reusing
 * a plain multi-column unique constraint doesn't work here because identity
 * varies by detector (keyword-only, page-only, or a page-pair for internal
 * linking) and Postgres treats NULL columns as distinct from each other in a
 * unique index — same problem jobs.idempotency_key was designed to sidestep,
 * solved the same way: one deterministic string, one unique column.
 */
export interface DedupeKeyInput {
  detectorType: SearchPerformanceDetectorType;
  keywordId?: string | null;
  pageId?: string | null;
  relatedPageId?: string | null;
}

export function buildDedupeKey(input: DedupeKeyInput): string {
  const keywordId = input.keywordId ?? "-";
  const pageId = input.pageId ?? "-";
  const relatedPageId = input.relatedPageId ?? "-";
  return `${input.detectorType}:${keywordId}:${pageId}:${relatedPageId}`;
}
