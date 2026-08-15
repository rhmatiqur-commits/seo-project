/**
 * Abstraction around an external SERP data source. Mirrors
 * lib/keywords/provider.ts's shape exactly: an interface here, a factory in
 * get-provider.ts, swappable implementations — wiring in a different SERP
 * provider later is a new file + one line in the factory, never a change to
 * the job handlers or the search-performance decision engine that consumes
 * the stored results.
 *
 * Deliberately ONE method. "Which competitors rank for this keyword" and
 * "ranked results" are pure, deterministic derivations of a single SERP
 * fetch (see lib/serp/overlap.ts, lib/db/competitors.ts) — they don't need
 * their own provider round-trip, which would double/triple DataForSEO credit
 * usage for no new information.
 */

export interface SerpResultItem {
  position: number;
  domain: string;
  url: string;
  title: string | null;
  description: string | null;
  /** Provider's own result-type vocabulary (organic/featured_snippet/local_pack/...) — passed through as-is. */
  resultType: string;
}

/** SERP-wide features (a property of the whole result page, not of any one
 * result) — only set when the provider reliably reports it. */
export interface SerpFeatures {
  localPack: boolean;
  featuredSnippet: boolean;
  reviews: boolean;
  faq: boolean;
  video: boolean;
  sitelinks: boolean;
  shopping: boolean;
  other: string[];
}

export interface SerpQueryOptions {
  country: string;
  language: string;
  /** Free-text location (e.g. "Coventry,England,United Kingdom") — local SEO matters; results are not globally interchangeable. */
  location?: string | null;
}

export interface SerpQueryResult {
  keyword: string;
  results: SerpResultItem[];
  features: SerpFeatures;
  /** Raw provider payload, for debugging only — the caller decides whether/how long to retain it. */
  raw?: unknown;
}

export interface SerpDataProvider {
  readonly name: string;

  getSerpResults(keyword: string, opts: SerpQueryOptions): Promise<SerpQueryResult>;
}
