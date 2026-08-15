-- Phase 2B: new job type for keyword discovery. Kept in its own migration/
-- transaction, separate from the rest of the keyword-intelligence schema, to
-- avoid any same-transaction enum-value-visibility edge cases with
-- subsequent statements that might reference it.

alter type job_type add value 'KEYWORD_DISCOVERY';
