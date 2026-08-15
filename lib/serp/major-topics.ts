/**
 * Simple deterministic word-frequency extraction from title/h1/headings —
 * NOT real NLP/entity extraction, documented as a heuristic signal only.
 * Kept in its own file, free of any `@/lib/env`-importing dependency, so it
 * stays testable without a full env setup (same reasoning as
 * lib/dataforseo/errors.ts).
 */

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "of", "to", "in", "on", "for", "with", "at", "by", "from", "up", "about", "into", "over", "after",
  "is", "are", "was", "were", "be", "been", "being", "this", "that", "these", "those", "it", "its", "as", "we", "you", "your", "our",
  "how", "what", "why", "when", "where", "who", "which", "can", "will", "do", "does", "not", "no", "yes",
]);

export function extractMajorTopics(texts: (string | null)[], limit = 5): string[] {
  const counts = new Map<string, number>();
  for (const text of texts) {
    if (!text) continue;
    const words = text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w));
    for (const word of words) counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word]) => word);
}
