-- Phase 5: new job types for the Publishing Engine (approved content ->
-- WordPress). Kept in its own migration/transaction, separate from the rest
-- of the publishing schema, to avoid same-transaction enum-value-visibility
-- edge cases with subsequent statements that might reference it (same
-- reasoning as 0005/0007/0009/0012/0015).

alter type job_type add value 'CREATE_DRAFT';
alter type job_type add value 'PUBLISH_CONTENT';
