import { dataforseoPost } from "@/lib/dataforseo/client";
import type { KeywordDataProvider, KeywordMetricsResult, KeywordSuggestion } from "@/lib/keywords/provider";

/**
 * DataForSEO implementation of the existing Phase 2B KeywordDataProvider
 * interface (lib/keywords/provider.ts) — zero interface changes needed, per
 * the Phase 3 spec's own hope. Uses the shared lib/dataforseo/client.ts HTTP
 * client (same auth/envelope handling the SERP provider uses).
 *
 * Field shapes below follow DataForSEO's documented Keyword Data / Labs
 * APIs; parsing is defensive (optional-chained, never throws on an
 * unexpected/missing field) since this integration needs live credentials
 * to fully verify (see README).
 */

interface RawSearchVolumeItem {
  keyword?: string;
  search_volume?: number | null;
  competition_index?: number | null; // 0-100
  cpc?: number | null;
}

interface RawKeywordSuggestionItem {
  keyword?: string;
  keyword_info?: { search_volume?: number | null };
}

interface RawRankedKeywordItem {
  keyword_data?: { keyword?: string; keyword_info?: { search_volume?: number | null } };
}

interface RawRelatedKeywordItem {
  keyword_data?: { keyword?: string; keyword_info?: { search_volume?: number | null } };
}

function locationNameFor(country: string): string {
  const map: Record<string, string> = { GB: "United Kingdom", US: "United States", IE: "Ireland", AU: "Australia", CA: "Canada" };
  return map[country.toUpperCase()] ?? "United Kingdom";
}

export class DataForSeoKeywordProvider implements KeywordDataProvider {
  readonly name = "dataforseo";

  async getKeywordMetrics(keywords: string[], opts: { country: string; language: string }): Promise<KeywordMetricsResult[]> {
    if (keywords.length === 0) return [];
    const { result } = await dataforseoPost<RawSearchVolumeItem>("/v3/keywords_data/google_ads/search_volume/live", {
      keywords,
      location_name: locationNameFor(opts.country),
      language_code: opts.language,
    });

    return result
      .filter((item) => item.keyword && (item.search_volume != null || item.cpc != null || item.competition_index != null))
      .map((item) => ({
        keyword: item.keyword!,
        searchVolume: item.search_volume ?? null,
        competition: item.competition_index != null ? Math.round((item.competition_index / 100) * 100) / 100 : null,
        cpc: item.cpc ?? null,
      }));
  }

  async getKeywordSuggestions(seed: { url?: string; topics?: string[] }, opts: { country: string; language: string; limit: number }): Promise<KeywordSuggestion[]> {
    const locationName = locationNameFor(opts.country);

    // A URL seed maps onto "what does this site already rank for" (DataForSEO
    // Labs ranked_keywords) — a reasonable proxy for "suggestions from a URL"
    // since there's no direct URL-seeded suggestion endpoint.
    if (seed.url) {
      const { result } = await dataforseoPost<{ items?: RawRankedKeywordItem[] }>("/v3/dataforseo_labs/google/ranked_keywords/live", {
        target: new URL(seed.url).hostname,
        location_name: locationName,
        language_code: opts.language,
        limit: opts.limit,
      });
      const items = result[0]?.items ?? [];
      return items
        .filter((i) => i.keyword_data?.keyword)
        .map((i) => ({ keyword: i.keyword_data!.keyword!, searchVolume: i.keyword_data?.keyword_info?.search_volume ?? null }));
    }

    const seedKeyword = seed.topics?.[0];
    if (!seedKeyword) return [];

    const { result } = await dataforseoPost<{ items?: RawKeywordSuggestionItem[] }>("/v3/dataforseo_labs/google/keyword_suggestions/live", {
      keyword: seedKeyword,
      location_name: locationName,
      language_code: opts.language,
      limit: opts.limit,
    });
    const items = result[0]?.items ?? [];
    return items.filter((i) => i.keyword).map((i) => ({ keyword: i.keyword!, searchVolume: i.keyword_info?.search_volume ?? null }));
  }

  async getRelatedKeywords(keyword: string, opts: { country: string; language: string; limit: number }): Promise<KeywordSuggestion[]> {
    const { result } = await dataforseoPost<{ items?: RawRelatedKeywordItem[] }>("/v3/dataforseo_labs/google/related_keywords/live", {
      keyword,
      location_name: locationNameFor(opts.country),
      language_code: opts.language,
      limit: opts.limit,
      depth: 1,
    });
    const items = result[0]?.items ?? [];
    return items
      .filter((i) => i.keyword_data?.keyword)
      .map((i) => ({ keyword: i.keyword_data!.keyword!, searchVolume: i.keyword_data?.keyword_info?.search_volume ?? null }));
  }
}
