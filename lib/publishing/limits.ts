/**
 * Named, documented limits for the Publishing Engine (Phase 5) — same
 * "cheap named constant instead of an unbounded loop/magic number"
 * convention as every prior phase's limits.ts.
 */

/** Hard timeout on any single WordPress REST API call — respects rate
 * limits/slow origins without hanging a serverless invocation. */
export const WORDPRESS_REQUEST_TIMEOUT_MS = 15_000;

/** Bound on how many results a slug lookup ever requests — a slug should
 * resolve to at most one page, this is just a sane API-call cap. */
export const WORDPRESS_SLUG_LOOKUP_PER_PAGE = 5;
