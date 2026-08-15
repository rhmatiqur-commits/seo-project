/** Sensible, named thresholds for the SEO Decision Engine's deterministic
 * detectors — same pattern as lib/crawler/limits.ts and lib/keywords/limits.ts.
 * Every threshold here exists specifically so "meaningful" vs "noise" is a
 * documented, tunable constant rather than a magic number buried in a detector. */

// --- Historical comparison windows (lib/search-performance/comparison.ts) ---

/** Default current-vs-previous comparison window. */
export const DEFAULT_COMPARISON_WINDOW_DAYS = 7;
/** Attempted opportunistically when a connection has enough synced history. */
export const EXTENDED_COMPARISON_WINDOW_DAYS = 28;
/** Below this many impressions in the *previous* period, a comparison is too
 * noisy to trust (a query going from 1 click to 0 isn't a "decline"). */
export const MIN_BASELINE_IMPRESSIONS_FOR_COMPARISON = 20;

// --- PAGE_TWO_OPPORTUNITY ---

export const PAGE_TWO_MIN_POSITION = 11;
export const PAGE_TWO_MAX_POSITION = 20;
/** Impressions below this are not "meaningful demand" for page-two/missing-page detection. */
export const MIN_MEANINGFUL_IMPRESSIONS = 50;

// --- HIGH_IMPRESSIONS_LOW_CTR ---

/** Actual CTR must fall short of the expected-CTR-for-position benchmark
 * (lib/search-performance/expected-ctr.ts) by at least this percentage to flag. */
export const LOW_CTR_GAP_THRESHOLD_PCT = 40;

// --- DECLINING_KEYWORD ---

export const DECLINE_CLICKS_THRESHOLD_PCT = 30;
export const DECLINE_IMPRESSIONS_THRESHOLD_PCT = 30;
/** Average position worsening by at least this many spots (e.g. 8 -> 12 = 4). */
export const DECLINE_POSITION_THRESHOLD = 3;

// --- EMERGING_KEYWORD ---

export const EMERGING_IMPRESSIONS_GROWTH_THRESHOLD_PCT = 50;
/** A query with zero previous-period presence needs at least this many
 * current-period impressions to count as "emerging" rather than noise. */
export const EMERGING_MIN_NEW_IMPRESSIONS = 30;

// --- INTERNAL_LINK_OPPORTUNITY ---

/** Bounds how many "should link to X" candidates one keyword can produce —
 * "do not create links blindly" means a handful of the most relevant
 * candidate source pages, not every page that mentions the topic at all. */
export const MAX_INTERNAL_LINK_SOURCES_PER_KEYWORD = 2;

// --- Scoring / promotion (lib/search-performance/scoring.ts) ---

/** A search_performance_opportunities.opportunity_score at or above this is
 * eligible for promotion into a real seo_opportunities/seo_tasks row. */
export const PROMOTION_THRESHOLD = 8;

/** Hard cap on how many opportunities one ANALYSE_SEARCH_PERFORMANCE run
 * promotes into real tasks, highest-scored first — a cheap, low-effort
 * detector (e.g. internal linking) clearing the threshold easily should not
 * be able to flood the task list in a single run. Same restraint pattern as
 * MAX_OPPORTUNITIES_PER_RUN/MAX_KEYWORDS_PER_DISCOVERY_RUN elsewhere; rows
 * that don't fit this run's budget are still stored and scored, so they're
 * simply picked up (or re-scored) on the next run. */
export const MAX_PROMOTIONS_PER_RUN = 15;

// --- AI interpretation ---

/** Hard cap on how many not-yet-interpreted opportunities get sent to the AI
 * provider in one ANALYSE_SEARCH_PERFORMANCE run — bounds cost/latency,
 * mirrors MAX_KEYWORDS_PER_DISCOVERY_RUN. */
export const MAX_AI_INTERPRETATIONS_PER_RUN = 10;
