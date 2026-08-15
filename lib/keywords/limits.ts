/** Sensible, named limits for keyword discovery — same pattern as
 * lib/crawler/limits.ts and lib/ai/schemas.ts's MAX_* constants. */

/** Hard cap on how many keyword candidates one discovery run persists,
 * regardless of how many the AI or a real provider proposes. */
export const MAX_KEYWORDS_PER_DISCOVERY_RUN = 20;

/** A page-match relevance score (0-100, see lib/keywords/matching.ts) below
 * this is treated as "no relevant existing page" — i.e. a missing-page
 * candidate rather than an optimise-existing-page one. */
export const MIN_PAGE_MATCH_RELEVANCE = 20;

/** A keyword_opportunities.opportunity_score at or above this is promoted
 * into a real seo_opportunities/seo_tasks row — not every keyword becomes a
 * task, only the ones worth acting on. */
export const PROMOTION_THRESHOLD = 8;
