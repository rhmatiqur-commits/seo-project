-- Phase 3: new job types for the SERP/competitor intelligence pipeline.
-- Kept in its own migration/transaction, separate from the rest of the
-- competitor schema, to avoid same-transaction enum-value-visibility edge
-- cases with subsequent statements that might reference it (same reasoning
-- as 0005/0007/0009).

alter type job_type add value 'FETCH_SERP_RESULTS';
alter type job_type add value 'ANALYSE_COMPETITORS';
alter type job_type add value 'ANALYSE_COMPETITOR_GAPS';
