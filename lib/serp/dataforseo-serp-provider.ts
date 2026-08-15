import { dataforseoPost } from "@/lib/dataforseo/client";
import { normalizeSerpItems, type RawSerpItem } from "@/lib/serp/normalize";
import type { SerpDataProvider, SerpQueryOptions, SerpQueryResult } from "@/lib/serp/provider";

/** A small, common-country fallback so a website with no explicit
 * `default_serp_location` still gets a locale-appropriate SERP rather than
 * DataForSEO's own default (typically US) — deliberately tiny; a website
 * that needs precision should set `default_serp_location` explicitly. */
const COUNTRY_LOCATION_FALLBACK: Record<string, string> = {
  GB: "United Kingdom",
  US: "United States",
  IE: "Ireland",
  AU: "Australia",
  CA: "Canada",
};

interface DataForSeoSerpTaskResult {
  keyword: string;
  items?: RawSerpItem[];
}

export class DataForSeoSerpProvider implements SerpDataProvider {
  readonly name = "dataforseo";

  async getSerpResults(keyword: string, opts: SerpQueryOptions): Promise<SerpQueryResult> {
    const locationName = opts.location || COUNTRY_LOCATION_FALLBACK[opts.country.toUpperCase()] || undefined;

    const { result } = await dataforseoPost<DataForSeoSerpTaskResult>("/v3/serp/google/organic/live/regular", {
      keyword,
      language_code: opts.language,
      ...(locationName ? { location_name: locationName } : {}),
      device: "desktop",
    });

    const items = result[0]?.items ?? [];
    const { results, features } = normalizeSerpItems(items);

    return { keyword, results, features, raw: result[0] ?? null };
  }
}
