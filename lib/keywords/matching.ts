import { normalizeKeyword } from "@/lib/keywords/normalize";

/**
 * Lexical, heuristic keyword-to-page relevance scoring. This is NOT semantic
 * (embeddings) matching — there's no embeddings model in scope for Phase 2B —
 * it's weighted word-overlap against a handful of on-page signals. The job
 * handler additionally folds in the AI's own holistic relevance judgement
 * (match_type 'ai_semantic') from the same discovery call; this module only
 * covers the lexical half.
 */

export interface MatchablePage {
  url: string;
  title: string | null;
  h1: string | null;
  headings: string[];
  metaDescription: string | null;
}

export type LexicalMatchType = "title" | "h1" | "heading" | "url" | "meta_description" | "none";

export interface PageMatchResult {
  matchType: LexicalMatchType;
  relevanceScore: number; // 0-100
}

// Weights sum to 100 when every field is a perfect match. Title carries the
// most weight (strongest on-page relevance signal), URL/meta the least
// (easily present without being the true topical focus of the page).
const WEIGHTS = {
  title: 40,
  h1: 25,
  heading: 15,
  url: 10,
  meta_description: 10,
} as const;

function wordOverlapRatio(keywordWords: string[], fieldText: string | null): number {
  if (!fieldText || keywordWords.length === 0) return 0;
  const normalizedField = normalizeKeyword(fieldText);
  const matched = keywordWords.filter((w) => normalizedField.includes(w));
  return matched.length / keywordWords.length;
}

/** Scores how relevant a single crawled page is to a keyword. */
export function scorePageMatch(keyword: string, page: MatchablePage): PageMatchResult {
  const keywordWords = normalizeKeyword(keyword).split(" ").filter(Boolean);
  const urlText = page.url.replace(/[/_-]+/g, " ");
  const headingsText = page.headings.join(" ");

  const fieldScores: Record<Exclude<LexicalMatchType, "none">, number> = {
    title: wordOverlapRatio(keywordWords, page.title) * WEIGHTS.title,
    h1: wordOverlapRatio(keywordWords, page.h1) * WEIGHTS.h1,
    heading: wordOverlapRatio(keywordWords, headingsText) * WEIGHTS.heading,
    url: wordOverlapRatio(keywordWords, urlText) * WEIGHTS.url,
    meta_description: wordOverlapRatio(keywordWords, page.metaDescription) * WEIGHTS.meta_description,
  };

  const relevanceScore = Math.round(Object.values(fieldScores).reduce((a, b) => a + b, 0) * 100) / 100;

  if (relevanceScore <= 0) return { matchType: "none", relevanceScore: 0 };

  // Attribute the match to whichever field contributed most, breaking ties
  // by signal strength (title strongest, meta weakest).
  const priority: (keyof typeof fieldScores)[] = ["title", "h1", "heading", "url", "meta_description"];
  const matchType = priority.reduce((best, field) => (fieldScores[field] > fieldScores[best] ? field : best), priority[0]!);

  return { matchType, relevanceScore };
}

/** Scores a keyword against every candidate page and returns the single best
 * match, or null if nothing scores above zero. */
export function findBestPageMatch(keyword: string, pages: MatchablePage[]): (PageMatchResult & { page: MatchablePage }) | null {
  let best: (PageMatchResult & { page: MatchablePage }) | null = null;
  for (const page of pages) {
    const result = scorePageMatch(keyword, page);
    if (result.matchType === "none") continue;
    if (!best || result.relevanceScore > best.relevanceScore) best = { ...result, page };
  }
  return best;
}
