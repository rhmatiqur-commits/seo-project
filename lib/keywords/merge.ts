import { normalizeKeyword } from "@/lib/keywords/normalize";

export interface KeywordCandidate {
  keyword: string;
  source: "provider" | "ai_suggested";
}

/**
 * Merges keyword candidates from the two sources (KeywordDataProvider +
 * AI-derived) into one deduped list. This is deliberately a pure function —
 * it's what lets "provider failure handling" be tested without mocking a DB
 * or an HTTP client: the job handler wraps the provider call in its own
 * try/catch and simply passes an empty array here on failure, so this
 * function only ever needs to prove "an empty provider list still produces a
 * sane merged result from AI candidates alone."
 *
 * When a keyword appears in both sources, the AI-suggested version wins —
 * it's the one carrying intent/relevance classification the discovery job
 * needs downstream; a provider-only duplicate would just be the same phrase
 * with strictly less information attached.
 */
export function mergeKeywordCandidates(providerCandidates: KeywordCandidate[], aiCandidates: KeywordCandidate[]): KeywordCandidate[] {
  const byNormalized = new Map<string, KeywordCandidate>();

  for (const candidate of providerCandidates) {
    const key = normalizeKeyword(candidate.keyword);
    if (!key) continue;
    byNormalized.set(key, candidate);
  }
  for (const candidate of aiCandidates) {
    const key = normalizeKeyword(candidate.keyword);
    if (!key) continue;
    byNormalized.set(key, candidate); // AI candidates always win on conflict
  }

  return Array.from(byNormalized.values());
}
