-- Phase 4: new job types for the Content Execution pipeline (brief -> draft
-- -> QA -> revision -> human approval). Kept in its own migration/
-- transaction, separate from the rest of the content schema, to avoid
-- same-transaction enum-value-visibility edge cases with subsequent
-- statements that might reference it (same reasoning as 0005/0007/0009/0012).

alter type job_type add value 'GENERATE_CONTENT';
alter type job_type add value 'QA_CONTENT';
alter type job_type add value 'REVISE_CONTENT';
