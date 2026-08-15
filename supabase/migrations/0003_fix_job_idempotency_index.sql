-- The original partial unique index on jobs.idempotency_key was scoped only
-- to "idempotency_key is not null", not to job status. That means once a
-- CRAWL_WEBSITE job for a website reaches a terminal state (COMPLETED etc.),
-- its idempotency_key ("CRAWL_WEBSITE:<website_id>") is permanently taken —
-- re-triggering a fresh crawl/audit/opportunity run later fails with a
-- unique-constraint violation. The intent (see createJob() in lib/db/jobs.ts)
-- was only to prevent duplicate *in-flight* jobs of the same type; scope the
-- index to non-terminal statuses so completed jobs free up their key.

drop index if exists jobs_idempotency_key_uidx;

create unique index jobs_idempotency_key_uidx on jobs (idempotency_key)
  where idempotency_key is not null and status in ('PENDING', 'PROCESSING');
