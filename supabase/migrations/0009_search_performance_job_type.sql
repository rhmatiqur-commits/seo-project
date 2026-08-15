-- Phase 2D: new job type for the SEO Decision Engine's deterministic
-- analysis pass. Kept in its own migration/transaction, separate from the
-- rest of the search-performance schema, to avoid same-transaction
-- enum-value-visibility edge cases with subsequent statements that might
-- reference it (same reasoning as 0005/0007).

alter type job_type add value 'ANALYSE_SEARCH_PERFORMANCE';
