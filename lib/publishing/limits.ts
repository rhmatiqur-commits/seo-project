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

// --- GitHub/Vercel Publishing Provider (Phase 6A) ---

/** Hard timeout on any single GitHub REST API call. */
export const GITHUB_REQUEST_TIMEOUT_MS = 15_000;

/** Repository-discovery cap (spec: "list accessible repositories") — a
 * connected account could have hundreds; this bounds one page fetch to a
 * sane number rather than paginating indefinitely during connection setup. */
export const GITHUB_REPO_LIST_PER_PAGE = 100;

/** Bound on how many results a branch/PR-existence lookup ever requests —
 * same reasoning as WORDPRESS_SLUG_LOOKUP_PER_PAGE. */
export const GITHUB_PR_LOOKUP_PER_PAGE = 5;

/** Prefix for every branch this platform creates — makes SEO-platform-
 * created branches unambiguously identifiable in the repository's branch
 * list, and gives the idempotency check (lib/publishing/github/retry-strategy.ts)
 * a stable, deterministic name to look for per content_version. */
export const GITHUB_BRANCH_PREFIX = "seo-platform";

