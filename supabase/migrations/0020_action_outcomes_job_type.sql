-- Phase 6: new job type for the Autonomous SEO Optimisation Loop's
-- background analysis job. Kept in its own migration/transaction, separate
-- from the rest of the Phase 6 schema, to avoid same-transaction
-- enum-value-visibility edge cases with subsequent statements that might
-- reference it (same reasoning as 0005/0007/0009/0012/0015/0017).

alter type job_type add value 'ANALYSE_ACTION_OUTCOMES';
