-- Phase 2A: autonomous job scheduling.
-- Minimum necessary scheduling fields on websites (status/last_crawled_at
-- already existed and are reused as-is), plus a small table to persist
-- scheduler run history for the admin UI (a stateless endpoint otherwise has
-- no memory of "when did this last run" between invocations).

alter table websites
  add column next_crawl_at timestamptz,
  add column crawl_frequency_days integer not null default 7;

-- Used by the scheduler to find due active websites without a full table scan.
create index websites_next_crawl_at_idx on websites (next_crawl_at) where status = 'active';

create table scheduler_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status job_status not null default 'PROCESSING', -- reuses the existing job_status enum
  websites_checked integer not null default 0,
  crawl_jobs_created integer not null default 0,
  jobs_processed integer not null default 0,
  jobs_completed integer not null default 0,
  jobs_failed integer not null default 0,
  jobs_retried integer not null default 0,
  stale_recovered integer not null default 0,
  summary jsonb not null default '{}'::jsonb,
  error text
);

create index scheduler_runs_started_at_idx on scheduler_runs (started_at desc);

-- Platform-internal operational data, not tenant data — no organization_id,
-- so it doesn't fit the is_org_member() policy pattern used elsewhere. RLS is
-- enabled with no policies (default-deny for anon/authenticated); only the
-- server's service-role key (which bypasses RLS) ever reads/writes this.
alter table scheduler_runs enable row level security;
