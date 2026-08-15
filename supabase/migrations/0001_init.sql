-- Phase 1 schema for the AI SEO Automation Platform.
-- Multi-tenant: every client-specific row belongs to an organization (directly,
-- or transitively via website_id -> websites.organization_id).
-- UUID primary keys throughout; created_at/updated_at timestamps on every table.

create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type membership_role as enum ('owner', 'admin', 'member');

create type website_status as enum ('active', 'paused', 'archived');

create type job_type as enum (
  'CRAWL_WEBSITE',
  'ANALYSE_WEBSITE',
  'RUN_SEO_AUDIT',
  'GENERATE_SEO_OPPORTUNITIES'
);

create type job_status as enum ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');

create type issue_severity as enum ('critical', 'high', 'medium', 'low');

create type issue_status as enum ('open', 'resolved', 'ignored');

create type opportunity_type as enum (
  'CREATE_NEW_PAGE',
  'OPTIMISE_EXISTING_PAGE',
  'TECHNICAL_FIX',
  'INTERNAL_LINKING',
  'RESEARCH_REQUIRED'
);

create type opportunity_effort as enum ('low', 'medium', 'high');

create type opportunity_status as enum ('new', 'approved', 'rejected', 'done');

create type task_status as enum ('pending', 'in_progress', 'completed', 'cancelled');

create type keyword_source as enum ('ai_suggested', 'manual');

-- ---------------------------------------------------------------------------
-- Core tenancy
-- ---------------------------------------------------------------------------

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One row per (user, organization). Drives RLS everywhere else.
create table memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role membership_role not null default 'member',
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index memberships_organization_id_idx on memberships (organization_id);
create index memberships_user_id_idx on memberships (user_id);

-- ---------------------------------------------------------------------------
-- Websites
-- ---------------------------------------------------------------------------

create table websites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  name text not null,
  base_url text not null,
  sitemap_url text,
  robots_txt_available boolean,
  sitemap_available boolean,
  crawl_max_pages integer not null default 50,
  crawl_max_depth integer not null default 4,
  status website_status not null default 'active',
  last_crawled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index websites_organization_id_idx on websites (organization_id);

-- ---------------------------------------------------------------------------
-- Async job system (generic background jobs; see also ai_jobs below for
-- per-AI-call metadata, which is a distinct, finer-grained concern)
-- ---------------------------------------------------------------------------

create table jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  website_id uuid references websites (id) on delete cascade,
  job_type job_type not null,
  status job_status not null default 'PENDING',
  priority integer not null default 0,
  retry_count integer not null default 0,
  max_retries integer not null default 3,
  idempotency_key text,
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create index jobs_organization_id_idx on jobs (organization_id);
create index jobs_website_id_idx on jobs (website_id);
create index jobs_status_idx on jobs (status);
create index jobs_org_status_idx on jobs (organization_id, status);
-- Prevent duplicate in-flight jobs of the same type for the same website.
create unique index jobs_idempotency_key_uidx on jobs (idempotency_key) where idempotency_key is not null;

-- ---------------------------------------------------------------------------
-- Crawl output
-- ---------------------------------------------------------------------------

create table website_pages (
  id uuid primary key default gen_random_uuid(),
  website_id uuid not null references websites (id) on delete cascade,
  url text not null,
  url_hash text not null, -- sha256(normalized url); used for dedupe
  path text,
  depth integer,
  http_status integer,
  redirect_chain jsonb, -- [{url, status}, ...] when redirects were followed
  title text,
  meta_description text,
  h1 text,
  headings jsonb not null default '[]'::jsonb, -- [{level, text}, ...]
  word_count integer,
  canonical_url text,
  is_noindex boolean not null default false,
  has_structured_data boolean not null default false,
  structured_data_types text[] not null default '{}',
  images_count integer not null default 0,
  images_missing_alt_count integer not null default 0,
  internal_links_count integer not null default 0,
  external_links_count integer not null default 0,
  is_orphan boolean,
  raw_meta jsonb not null default '{}'::jsonb, -- flexible extras (og:*, twitter:*, etc.)
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  crawled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (website_id, url_hash)
);

create index website_pages_website_id_idx on website_pages (website_id);
create index website_pages_http_status_idx on website_pages (http_status);

create table page_links (
  id uuid primary key default gen_random_uuid(),
  website_id uuid not null references websites (id) on delete cascade,
  source_page_id uuid not null references website_pages (id) on delete cascade,
  target_url text not null,
  target_page_id uuid references website_pages (id) on delete set null,
  anchor_text text,
  is_internal boolean not null default true,
  is_external boolean not null default false,
  http_status integer, -- populated when the link target was checked
  created_at timestamptz not null default now()
);

create index page_links_website_id_idx on page_links (website_id);
create index page_links_source_page_id_idx on page_links (source_page_id);
create index page_links_target_page_id_idx on page_links (target_page_id);

-- ---------------------------------------------------------------------------
-- SEO audit (technical checks over crawled pages)
-- ---------------------------------------------------------------------------

create table seo_audits (
  id uuid primary key default gen_random_uuid(),
  website_id uuid not null references websites (id) on delete cascade,
  job_id uuid references jobs (id) on delete set null,
  status job_status not null default 'PENDING',
  pages_analyzed integer not null default 0,
  issues_found integer not null default 0,
  summary jsonb not null default '{}'::jsonb, -- counts by severity/category
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index seo_audits_website_id_idx on seo_audits (website_id);

create table seo_issues (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references seo_audits (id) on delete cascade,
  website_id uuid not null references websites (id) on delete cascade,
  page_id uuid references website_pages (id) on delete cascade, -- null = sitewide issue
  issue_type text not null, -- e.g. 'MISSING_TITLE', 'DUPLICATE_TITLE', ...
  category text not null, -- 'content' | 'technical' | 'links' | 'indexing'
  severity issue_severity not null,
  title text not null,
  description text not null,
  recommended_action text not null,
  detected_data jsonb not null default '{}'::jsonb, -- supporting raw facts (e.g. duplicate group)
  status issue_status not null default 'open',
  created_at timestamptz not null default now()
);

create index seo_issues_audit_id_idx on seo_issues (audit_id);
create index seo_issues_website_id_idx on seo_issues (website_id);
create index seo_issues_page_id_idx on seo_issues (page_id);
create index seo_issues_severity_idx on seo_issues (severity);

-- ---------------------------------------------------------------------------
-- Keywords & competitors (manual / AI-suggested only — no scraping in Phase 1)
-- ---------------------------------------------------------------------------

create table keywords (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  website_id uuid references websites (id) on delete cascade,
  keyword text not null,
  intent text, -- 'commercial' | 'informational' | 'navigational' | 'transactional' | null
  source keyword_source not null default 'manual',
  notes text,
  created_at timestamptz not null default now(),
  unique (website_id, keyword)
);

create index keywords_organization_id_idx on keywords (organization_id);
create index keywords_website_id_idx on keywords (website_id);

create table competitors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  website_id uuid references websites (id) on delete cascade,
  name text not null,
  domain text,
  notes text,
  created_at timestamptz not null default now()
);

create index competitors_organization_id_idx on competitors (organization_id);
create index competitors_website_id_idx on competitors (website_id);

-- ---------------------------------------------------------------------------
-- AI job metadata (one row per individual AI provider call)
-- ---------------------------------------------------------------------------

create table ai_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  job_id uuid references jobs (id) on delete set null,
  provider text not null, -- e.g. 'anthropic'
  model text not null,
  prompt_version text not null,
  purpose text not null, -- e.g. 'website_analysis', 'opportunity_generation'
  input_summary jsonb not null default '{}'::jsonb, -- counts/shape of what was sent, never raw sensitive content
  prompt_tokens integer,
  completion_tokens integer,
  total_tokens integer,
  latency_ms integer,
  status job_status not null default 'PENDING',
  error text,
  result jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index ai_jobs_organization_id_idx on ai_jobs (organization_id);
create index ai_jobs_job_id_idx on ai_jobs (job_id);

-- ---------------------------------------------------------------------------
-- SEO opportunities (AI-generated recommendations) & tasks
-- ---------------------------------------------------------------------------

create table seo_opportunities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  website_id uuid not null references websites (id) on delete cascade,
  type opportunity_type not null,
  title text not null,
  description text not null,
  rationale text not null,
  target_page_id uuid references website_pages (id) on delete set null,
  priority_score numeric(5, 2) not null default 0,
  priority_components jsonb not null default '{}'::jsonb, -- {business_relevance, search_intent, coverage_gap, commercial_value, effort}
  effort_estimate opportunity_effort not null default 'medium',
  status opportunity_status not null default 'new',
  ai_job_id uuid references ai_jobs (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index seo_opportunities_organization_id_idx on seo_opportunities (organization_id);
create index seo_opportunities_website_id_idx on seo_opportunities (website_id);
create index seo_opportunities_status_idx on seo_opportunities (status);

create table opportunity_keywords (
  opportunity_id uuid not null references seo_opportunities (id) on delete cascade,
  keyword_id uuid not null references keywords (id) on delete cascade,
  primary key (opportunity_id, keyword_id)
);

create table seo_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  website_id uuid not null references websites (id) on delete cascade,
  opportunity_id uuid references seo_opportunities (id) on delete set null,
  title text not null,
  description text,
  type opportunity_type not null,
  status task_status not null default 'pending',
  priority integer not null default 0,
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index seo_tasks_organization_id_idx on seo_tasks (organization_id);
create index seo_tasks_website_id_idx on seo_tasks (website_id);
create index seo_tasks_status_idx on seo_tasks (status);
create index seo_tasks_org_status_idx on seo_tasks (organization_id, status);

-- ---------------------------------------------------------------------------
-- updated_at trigger helper
-- ---------------------------------------------------------------------------

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger organizations_set_updated_at before update on organizations
  for each row execute function set_updated_at();
create trigger websites_set_updated_at before update on websites
  for each row execute function set_updated_at();
create trigger website_pages_set_updated_at before update on website_pages
  for each row execute function set_updated_at();
create trigger seo_opportunities_set_updated_at before update on seo_opportunities
  for each row execute function set_updated_at();
create trigger seo_tasks_set_updated_at before update on seo_tasks
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
-- The Phase 1 admin app talks to Supabase with the service-role key (server-side
-- only), which bypasses RLS by design. These policies exist so that Phase 2 can
-- safely expose data directly to authenticated client users via the anon/user
-- JWT without further schema changes.

create or replace function is_org_member(target_org_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from memberships
    where organization_id = target_org_id
      and user_id = auth.uid()
  );
$$;

alter table organizations enable row level security;
alter table memberships enable row level security;
alter table websites enable row level security;
alter table jobs enable row level security;
alter table website_pages enable row level security;
alter table page_links enable row level security;
alter table seo_audits enable row level security;
alter table seo_issues enable row level security;
alter table keywords enable row level security;
alter table competitors enable row level security;
alter table ai_jobs enable row level security;
alter table seo_opportunities enable row level security;
alter table opportunity_keywords enable row level security;
alter table seo_tasks enable row level security;

create policy organizations_member_select on organizations
  for select using (is_org_member(id));

create policy memberships_member_select on memberships
  for select using (is_org_member(organization_id));

create policy websites_member_all on websites
  for all using (is_org_member(organization_id)) with check (is_org_member(organization_id));

create policy jobs_member_all on jobs
  for all using (is_org_member(organization_id)) with check (is_org_member(organization_id));

create policy website_pages_member_all on website_pages
  for all using (is_org_member((select organization_id from websites where websites.id = website_id)))
  with check (is_org_member((select organization_id from websites where websites.id = website_id)));

create policy page_links_member_all on page_links
  for all using (is_org_member((select organization_id from websites where websites.id = website_id)))
  with check (is_org_member((select organization_id from websites where websites.id = website_id)));

create policy seo_audits_member_all on seo_audits
  for all using (is_org_member((select organization_id from websites where websites.id = website_id)))
  with check (is_org_member((select organization_id from websites where websites.id = website_id)));

create policy seo_issues_member_all on seo_issues
  for all using (is_org_member((select organization_id from websites where websites.id = website_id)))
  with check (is_org_member((select organization_id from websites where websites.id = website_id)));

create policy keywords_member_all on keywords
  for all using (is_org_member(organization_id)) with check (is_org_member(organization_id));

create policy competitors_member_all on competitors
  for all using (is_org_member(organization_id)) with check (is_org_member(organization_id));

create policy ai_jobs_member_all on ai_jobs
  for all using (is_org_member(organization_id)) with check (is_org_member(organization_id));

create policy seo_opportunities_member_all on seo_opportunities
  for all using (is_org_member(organization_id)) with check (is_org_member(organization_id));

create policy opportunity_keywords_member_all on opportunity_keywords
  for all using (
    is_org_member((select organization_id from seo_opportunities where seo_opportunities.id = opportunity_id))
  )
  with check (
    is_org_member((select organization_id from seo_opportunities where seo_opportunities.id = opportunity_id))
  );

create policy seo_tasks_member_all on seo_tasks
  for all using (is_org_member(organization_id)) with check (is_org_member(organization_id));
