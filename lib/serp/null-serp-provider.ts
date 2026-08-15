import type { SerpDataProvider, SerpQueryResult } from "@/lib/serp/provider";

/**
 * The default SerpDataProvider: no real SERP API is configured, so every
 * call honestly returns an empty result set rather than fabricating
 * rankings or competitors. Mirrors lib/keywords/null-provider.ts exactly.
 */
export class NullSerpProvider implements SerpDataProvider {
  readonly name = "none";

  async getSerpResults(keyword: string): Promise<SerpQueryResult> {
    return {
      keyword,
      results: [],
      features: { localPack: false, featuredSnippet: false, reviews: false, faq: false, video: false, sitelinks: false, shopping: false, other: [] },
    };
  }
}
