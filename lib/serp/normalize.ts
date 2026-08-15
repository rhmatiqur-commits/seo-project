import type { SerpResultItem, SerpFeatures } from "@/lib/serp/provider";

/**
 * Pure mapper from DataForSEO's raw SERP item shape into our stored/derived
 * shapes — no DB, no network, fully testable with constructed fixtures.
 * Deliberately generic about which raw fields are present (a real DataForSEO
 * response has more fields than this; we only ever read what we store).
 */
export interface RawSerpItem {
  type?: string;
  rank_absolute?: number;
  rank_group?: number;
  domain?: string;
  url?: string;
  title?: string | null;
  description?: string | null;
}

const FEATURE_TYPE_MAP: Record<string, Exclude<keyof SerpFeatures, "other">> = {
  local_pack: "localPack",
  featured_snippet: "featuredSnippet",
  reviews: "reviews",
  people_also_ask: "faq",
  faq: "faq",
  video: "video",
  sitelinks: "sitelinks",
  shopping: "shopping",
  commercial_units: "shopping",
};

/** Feature-bearing item types don't carry a stable ranked position/domain of
 * their own the way an 'organic' result does, so they're excluded from
 * `results[]` and only contribute to `features`. */
const NON_RANKED_TYPES = new Set(Object.keys(FEATURE_TYPE_MAP));

export function extractSerpFeatures(items: RawSerpItem[]): SerpFeatures {
  const features: SerpFeatures = { localPack: false, featuredSnippet: false, reviews: false, faq: false, video: false, sitelinks: false, shopping: false, other: [] };
  const seenOther = new Set<string>();

  for (const item of items) {
    if (!item.type) continue;
    const key = FEATURE_TYPE_MAP[item.type];
    if (key) {
      features[key] = true;
    } else if (item.type !== "organic" && !seenOther.has(item.type)) {
      seenOther.add(item.type);
      features.other.push(item.type);
    }
  }

  return features;
}

export function extractSerpResults(items: RawSerpItem[]): SerpResultItem[] {
  const results: SerpResultItem[] = [];

  for (const item of items) {
    if (item.type && NON_RANKED_TYPES.has(item.type)) continue;
    if (!item.domain || !item.url) continue;
    const position = item.rank_absolute ?? item.rank_group;
    if (typeof position !== "number") continue;

    results.push({
      position,
      domain: item.domain,
      url: item.url,
      title: item.title ?? null,
      description: item.description ?? null,
      resultType: item.type ?? "organic",
    });
  }

  return results;
}

export function normalizeSerpItems(items: RawSerpItem[]): { results: SerpResultItem[]; features: SerpFeatures } {
  return { results: extractSerpResults(items), features: extractSerpFeatures(items) };
}
