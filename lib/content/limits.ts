/**
 * Named, documented limits for the Content Execution pipeline (Phase 4) —
 * same "cheap named constant instead of an unbounded loop/magic number"
 * convention as every prior phase's limits.ts.
 */

// --- Revision loop ---

/** How many automatic QA-triggered revisions a content_job gets before it's
 * marked NEEDS_REVIEW instead of continuing forever. A human can still click
 * "Revise" manually beyond this — this only bounds the *automatic* loop. */
export const MAX_CONTENT_REVISIONS = 2;

// --- Deterministic QA thresholds ---

export const MIN_CONTENT_WORD_COUNT = 300;
export const MIN_PRIMARY_KEYWORD_OCCURRENCES = 1;
/** Occurrences of the primary keyword per 100 words above which content is flagged as stuffed. */
export const MAX_KEYWORD_DENSITY_PERCENT = 3;
export const MIN_SEO_TITLE_LENGTH = 10;
export const MAX_SEO_TITLE_LENGTH = 70;
export const MIN_META_DESCRIPTION_LENGTH = 50;
export const MAX_META_DESCRIPTION_LENGTH = 165;
export const MIN_HEADING_COUNT = 1;
/** Fraction (0-1) of the brief's recommendedTopics that must appear lexically in the body for "adequate" coverage. */
export const MIN_TOPIC_COVERAGE_RATIO = 0.3;

/** 0-100 composite score (deterministic pass-rate + AI dimension ratings, computed in lib/content/qa/compute-result.ts) a version must clear to pass QA, in addition to every blocking check passing. */
export const QA_PASS_SCORE_THRESHOLD = 70;

// --- Brief assembly bounds (cost/relevance control, mirrors Phase 3's MAX_COMPETITOR_PAGES_PER_RUN pattern) ---

export const MAX_COMPETITOR_PAGES_IN_BRIEF = 5;
export const MAX_SEARCH_CONSOLE_ROWS_IN_BRIEF = 10;
export const MAX_SECONDARY_KEYWORDS_IN_BRIEF = 8;
export const MAX_INTERNAL_LINK_OPPORTUNITIES_IN_BRIEF = 5;
export const MAX_CONTENT_GAPS_IN_BRIEF = 8;
export const MAX_RECOMMENDED_TOPICS_IN_BRIEF = 10;

// --- Generation ---

/** Long-form body generation needs far more headroom than the 1024-token
 * AIProvider default (used for short interpretation text elsewhere). */
export const CONTENT_GENERATION_MAX_TOKENS = 3500;
