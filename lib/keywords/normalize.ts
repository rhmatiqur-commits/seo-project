/**
 * Normalizes a raw keyword phrase into the canonical form used for dedupe
 * and storage: trimmed, lowercased, internal whitespace collapsed to a
 * single space. This is what makes "Landlord Accountant  Coventry" and
 * "landlord accountant coventry" resolve to the same keyword row.
 */
export function normalizeKeyword(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

/** True when two raw keyword strings normalize to the same value. */
export function isSameKeyword(a: string, b: string): boolean {
  return normalizeKeyword(a) === normalizeKeyword(b);
}

/**
 * Deduplicates a list of raw keyword strings by their normalized form,
 * keeping the first occurrence's original casing/spacing.
 */
export function dedupeKeywords(keywords: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const kw of keywords) {
    const key = normalizeKeyword(kw);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(kw.trim());
  }
  return result;
}
