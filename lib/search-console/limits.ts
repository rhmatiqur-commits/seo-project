/** Sensible, named limits for Google Search Console syncing — same pattern
 * as lib/crawler/limits.ts and lib/keywords/limits.ts. */

/** How many days back each sync pulls. Search Console data typically lags a
 * few days behind real-time, and re-pulling a short trailing window (instead
 * of "since last sync") self-heals if Google backfills/revises recent rows —
 * the unique constraint on search_console_metrics makes re-pulls idempotent. */
export const SYNC_LOOKBACK_DAYS = 7;

/** Hard cap on rows persisted per sync (Search Console's API itself supports
 * up to 25,000 rows per request; this keeps a single sync fast and bounded,
 * matching the crawler's/keyword-discovery's own restraint pattern). */
export const MAX_ROWS_PER_SYNC = 500;
