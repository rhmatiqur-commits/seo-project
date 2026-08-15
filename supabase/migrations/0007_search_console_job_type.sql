-- Phase 2C: new job type for Google Search Console sync. Kept in its own
-- migration/transaction, separate from the rest of the search-console
-- schema, to avoid same-transaction enum-value-visibility edge cases with
-- subsequent statements that might reference it (same reasoning as 0005).

alter type job_type add value 'SEARCH_CONSOLE_SYNC';
