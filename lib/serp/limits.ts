/** Sensible, named limits for the SERP/competitor intelligence pipeline —
 * same pattern as lib/crawler/limits.ts, lib/keywords/limits.ts,
 * lib/search-performance/limits.ts. */

// --- FETCH_SERP_RESULTS ---

/** Hard cap on how many keywords one FETCH_SERP_RESULTS run sends to the
 * provider, regardless of how many are due — bounds credit usage per run. */
export const MAX_KEYWORDS_PER_SERP_FETCH_RUN = 10;

/** Per-tier refetch cadence (days) — see lib/serp/priority-tier.ts. */
export const SERP_REFETCH_DAYS_HIGH = 7;
export const SERP_REFETCH_DAYS_MEDIUM = 14;
export const SERP_REFETCH_DAYS_LOW = 30;

/** A keyword_opportunities.opportunity_score at or above this qualifies a
 * keyword for the HIGH SERP-priority tier on its own. */
export const HIGH_PRIORITY_KEYWORD_SCORE_THRESHOLD = 8;
export const MEDIUM_PRIORITY_KEYWORD_SCORE_THRESHOLD = 4;
/** Recent (last comparison window) GSC impressions qualifying a keyword for HIGH/MEDIUM on their own. */
export const HIGH_PRIORITY_IMPRESSIONS_THRESHOLD = 500;
export const MEDIUM_PRIORITY_IMPRESSIONS_THRESHOLD = 100;

// --- Competitor identification/classification ---

/** A domain not matching a known Google/directory/marketplace/social/
 * informational pattern needs to appear for at least this many distinct
 * keywords before it's classified DIRECT_COMPETITOR (vs UNKNOWN) —
 * "repeatedly appears," per spec. */
export const MIN_APPEARANCES_FOR_DIRECT_COMPETITOR = 2;

/** Only the top N organic results per keyword count toward competitor
 * aggregation — position 47 isn't a meaningful competitive signal. */
export const MAX_COMPETITOR_RESULTS_CONSIDERED_PER_KEYWORD = 10;

// --- ANALYSE_COMPETITORS: competitor-page fetching ---

/** Hard cap on how many competitor pages one ANALYSE_COMPETITORS run
 * fetches+parses — "do not crawl every competitor URL automatically." */
export const MAX_COMPETITOR_PAGES_PER_RUN = 10;

// --- COMPETITOR_RANKING_GAP ---

/** Competitor must outrank the client by at least this many positions to
 * count as a "substantial" gap, not noise. */
export const RANKING_GAP_MIN_POSITION_DIFFERENCE = 5;

// --- COMPETITOR_CONTENT_GAP ---

/** A competitor must rank at or above this position to count as "ranks
 * highly" for content-gap purposes — position 47 isn't evidence a page is
 * worth building. Also the bar under which the client is considered to
 * "already rank reasonably" (skip — that's ranking-gap's territory instead). */
export const CONTENT_GAP_MAX_COMPETITOR_POSITION = 10;

// --- Provider usage / cost estimate ---

/** Approximate, publicly documented DataForSEO cost per live-regular SERP
 * request as of this writing — an estimate for internal cost tracking, NOT
 * a live account-specific figure (DataForSEO's actual pricing can change or
 * vary by plan). Labeled as an estimate everywhere it's shown. */
export const DATAFORSEO_SERP_COST_ESTIMATE_USD = 0.003;
