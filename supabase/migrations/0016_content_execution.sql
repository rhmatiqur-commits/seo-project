-- Phase 4: Content Execution Engine.
-- Turns a prioritised seo_opportunities row (CREATE_NEW_PAGE/
-- OPTIMISE_EXISTING_PAGE only) into a structured brief, a generated draft,
-- deterministic+AI QA, a bounded revision loop, and a human approval gate.
-- No publishing anywhere in this schema — that is Phase 5.

-- ---------------------------------------------------------------------------
-- Business-fact fields the brief needs and must never invent. Nullable,
-- admin-editable, default null — a null value is surfaced in a brief's
-- missingBusinessInfo list rather than silently left blank or fabricated.
-- ---------------------------------------------------------------------------

alter table websites
  add column business_description text,
  add column target_audience text,
  add column brand_voice text,
  add column content_constraints text;

-- ---------------------------------------------------------------------------
-- content_briefs.status: has this brief ever been submitted into generation.
-- Deliberately small/separate from the full approval lifecycle below (see
-- content_pipeline_status) — this only answers one question.
-- ---------------------------------------------------------------------------

create type content_brief_status as enum ('DRAFT', 'SUBMITTED');

-- ---------------------------------------------------------------------------
-- content_pipeline_status: the human-facing lifecycle of one content_jobs
-- row (one brief's generation effort), independent of job_status (which only
-- tracks whether an individual async step is currently running — see
-- lib/jobs/handlers/{generate,qa,revise}-content.ts).
-- ---------------------------------------------------------------------------

create type content_pipeline_status as enum (
  'DRAFT',
  'QA_PENDING',
  'QA_FAILED',
  'NEEDS_REVIEW',
  'READY_FOR_APPROVAL',
  'APPROVED',
  'REJECTED'
);

create type content_qa_status as enum ('PENDING', 'PASSED', 'FAILED');

-- ---------------------------------------------------------------------------
-- content_briefs — one row per seo_opportunities row a human chose to turn
-- into content. brief_data is the full structured ContentBrief
-- (lib/content/brief-types.ts), captured once at creation time so the brief
-- a human reviewed is exactly what the provider receives later.
-- ---------------------------------------------------------------------------

create table content_briefs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  website_id uuid not null references websites (id) on delete cascade,
  seo_opportunity_id uuid not null references seo_opportunities (id) on delete cascade,
  seo_task_id uuid references seo_tasks (id) on delete set null,
  primary_keyword_id uuid references keywords (id) on delete set null,
  primary_keyword text, -- denormalized: survives even if the keyword row is later removed
  search_intent text,
  target_url text, -- existing page URL (optimise) or a recommended slug (create) — see brief_data for which
  content_type opportunity_type not null, -- reused enum; only CREATE_NEW_PAGE/OPTIMISE_EXISTING_PAGE rows are ever inserted
  status content_brief_status not null default 'DRAFT',
  brief_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger content_briefs_set_updated_at before update on content_briefs
  for each row execute function set_updated_at();

create index content_briefs_website_id_idx on content_briefs (website_id);
create index content_briefs_seo_opportunity_id_idx on content_briefs (seo_opportunity_id);

-- ---------------------------------------------------------------------------
-- content_jobs — one row per content_brief's generation effort (not one row
-- per async step; those are ordinary rows in the existing `jobs` table,
-- linked back via jobs.payload->>'content_job_id'). `attempts` counts
-- revisions consumed so far (see lib/content/limits.ts's
-- MAX_CONTENT_REVISIONS). `status` is what the admin UI's
-- Approve/Reject/Revise actions read and mutate.
-- ---------------------------------------------------------------------------

create table content_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  website_id uuid not null references websites (id) on delete cascade,
  content_brief_id uuid not null references content_briefs (id) on delete cascade,
  provider text not null,
  status content_pipeline_status not null default 'DRAFT',
  attempts integer not null default 0,
  error text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create index content_jobs_content_brief_id_idx on content_jobs (content_brief_id);
create index content_jobs_website_status_idx on content_jobs (website_id, status);

-- ---------------------------------------------------------------------------
-- content_versions — every draft/revision, never overwritten.
-- unique(content_brief_id, version_number) makes "next version number" a
-- simple max()+1 with a safety net against a race producing duplicates.
-- ---------------------------------------------------------------------------

create table content_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  website_id uuid not null references websites (id) on delete cascade,
  content_brief_id uuid not null references content_briefs (id) on delete cascade,
  content_job_id uuid not null references content_jobs (id) on delete cascade,
  version_number integer not null,
  title text,
  content text not null,
  -- SEO title/meta description/suggested URL/H1 — kept separate from `content`
  -- (the body) per spec, so QA/display never has to parse them back out.
  metadata jsonb not null default '{}'::jsonb,
  qa_status content_qa_status not null default 'PENDING',
  created_at timestamptz not null default now(),
  unique (content_brief_id, version_number)
);

create index content_versions_content_brief_id_idx on content_versions (content_brief_id);

-- ---------------------------------------------------------------------------
-- content_qa_results — the full deterministic+AI QA breakdown for one
-- version. content_versions.qa_status is a fast summary column; this table
-- is the detail (mirrors how ai_jobs already exists alongside jobs).
-- ---------------------------------------------------------------------------

create table content_qa_results (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  website_id uuid not null references websites (id) on delete cascade,
  content_version_id uuid not null references content_versions (id) on delete cascade,
  ai_job_id uuid references ai_jobs (id) on delete set null, -- null when the AI QA call was skipped/failed (soft failure, deterministic-only result)
  passed boolean not null,
  score numeric(6, 2) not null,
  deterministic_checks jsonb not null default '[]'::jsonb,
  ai_feedback jsonb,
  issues jsonb not null default '[]'::jsonb,
  model text,
  prompt_version text,
  created_at timestamptz not null default now()
);

create index content_qa_results_content_version_id_idx on content_qa_results (content_version_id);

-- ---------------------------------------------------------------------------
-- Row Level Security — every table carries organization_id directly, same
-- direct-policy pattern as search_performance_opportunities/serp_runs.
-- ---------------------------------------------------------------------------

alter table content_briefs enable row level security;
alter table content_jobs enable row level security;
alter table content_versions enable row level security;
alter table content_qa_results enable row level security;

create policy content_briefs_member_all on content_briefs
  for all using (is_org_member(organization_id)) with check (is_org_member(organization_id));

create policy content_jobs_member_all on content_jobs
  for all using (is_org_member(organization_id)) with check (is_org_member(organization_id));

create policy content_versions_member_all on content_versions
  for all using (is_org_member(organization_id)) with check (is_org_member(organization_id));

create policy content_qa_results_member_all on content_qa_results
  for all using (is_org_member(organization_id)) with check (is_org_member(organization_id));
