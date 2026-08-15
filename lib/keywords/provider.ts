/**
 * Abstraction around an external keyword-data source (search volume, CPC,
 * competition, related/suggested keywords). Mirrors lib/ai/provider.ts's
 * shape: an interface here, a factory in get-provider.ts, and swappable
 * implementations — so wiring in a real provider (DataForSEO, Google Keyword
 * Planner, Ahrefs, etc.) later is a new file + one line in the factory,
 * never a change to the job handler that calls it.
 *
 * The only implementation today, NullKeywordProvider, returns empty results.
 * There is deliberately no "estimated" fallback that invents numbers — the
 * platform's rule is that search volume/CPC/competition are either real
 * provider data or they don't exist in the system at all.
 */

export interface KeywordMetricsResult {
  keyword: string;
  searchVolume: number | null;
  competition: number | null;
  cpc: number | null;
}

export interface KeywordSuggestion {
  keyword: string;
  /** Only set when the provider itself supplies it — never inferred. */
  searchVolume?: number | null;
}

export interface KeywordDataProvider {
  readonly name: string;

  /** Real measured metrics for a known list of keywords. Returns only the
   * keywords the provider actually has data for — never pads with nulls. */
  getKeywordMetrics(keywords: string[], opts: { country: string; language: string }): Promise<KeywordMetricsResult[]>;

  /** Candidate keywords suggested by the provider from a seed (site URL,
   * topic, or existing keywords) — real provider data, not AI-derived. */
  getKeywordSuggestions(
    seed: { url?: string; topics?: string[] },
    opts: { country: string; language: string; limit: number }
  ): Promise<KeywordSuggestion[]>;

  /** Keywords related to a single given keyword. */
  getRelatedKeywords(
    keyword: string,
    opts: { country: string; language: string; limit: number }
  ): Promise<KeywordSuggestion[]>;
}
