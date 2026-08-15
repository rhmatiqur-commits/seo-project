import type { KeywordDataProvider, KeywordMetricsResult, KeywordSuggestion } from "@/lib/keywords/provider";

/**
 * The default KeywordDataProvider: no real keyword-data API is configured,
 * so every call honestly returns nothing rather than fabricating volume,
 * CPC, competition, or suggestions. Keyword *candidates* still get generated
 * in Phase 2B — via the AI provider reasoning about the site's own content,
 * clearly labeled `source: 'ai_suggested'`, never `'provider'`.
 */
export class NullKeywordProvider implements KeywordDataProvider {
  readonly name = "none";

  async getKeywordMetrics(): Promise<KeywordMetricsResult[]> {
    return [];
  }

  async getKeywordSuggestions(): Promise<KeywordSuggestion[]> {
    return [];
  }

  async getRelatedKeywords(): Promise<KeywordSuggestion[]> {
    return [];
  }
}
