-- Phase 3: Competitor & SERP Intelligence.
-- Adds the platform's first "look outward" data source: who else ranks for
-- the client's important keywords (DataForSEO), stored as a time series
-- (serp_runs/serp_results), aggregated into classified/scored competitors
-- (competitor_domains), with structured (never raw-text) metadata for
-- selected high-value competitor pages (competitor_pages). Gap detection
-- feeds the *existing* search_performance_opportunities table (Phase 2D) —
-- see migration 0013 for the new detector_type values.

create type competitor_classification as enum (
  'DIRECT_COMPETITOR',
  'DIRECTORY',
  'MARKETPLACE',
  'INFORMATIONAL',
  'OTHER',
  'UNKNOWN'
);

-- ---------------------------------------------------------------------------
-- SERP fetch scheduling (mirrors next_crawl_at/next_keyword_discovery_at/
-- next_search_console_sync_at) — its own independent recurring cadence at
-- the website level; per-keyword HIGH/MEDIUM/LOW tiering happens in
-- application code (lib/serp/priority-tier.ts), not more schema.
-- ---------------------------------------------------------------------------

alter table websites
  add column next_serp_fetch_at timestamptz,
  add column serp_fetch_frequency_days integer not null default 7,
  add column default_serp_location text;

-- ---------------------------------------------------------------------------
-- serp_runs — one row per (keyword, location, point in time) SERP request.
-- Deliberately a time series (no uniqueness constraint) so ranking changes
-- over time are visible; "avoid duplicate runs" is an application-logic
-- concern (see lib/serp/priority-tier.ts's due-check), not a DB constraint.
-- ---------------------------------------------------------------------------

create table serp_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  website_id uuid not null references websites (id) on delete cascade,
  keyword_id uuid references keywords (id) on delete set null,
  keyword text not null, -- denormalized: survives even if the keyword row is later removed
  location text,
  country text not null default 'GB',
  language text not null default 'en',
  search_engine text not null default 'google',
  status job_status not null default 'PENDING', -- reuses the existing Phase 1 enum; no need for a near-duplicate
  error text,
  -- SERP-wide features for this run (local_pack/featured_snippet/faq/video/
  -- sitelinks/shopping/reviews/other) — a property of the whole SERP, not of
  -- an individual organic result. Never assumed present; only set when the
  -- provider reliably reports it.
  features jsonb not null default '{}'::jsonb,
  -- Raw provider payload, for debugging only. No retention/cleanup job yet
  -- (flagged, same as Phase 2C's plaintext-token simplification) — nullable
  -- so a future cleanup pass is safe to add without a schema change.
  raw_response jsonb,
  searched_at timestamptz,
  created_at timestamptz not null default now()
);

create index serp_runs_website_keyword_searched_idx on serp_runs (website_id, keyword_id, searched_at desc);

-- ---------------------------------------------------------------------------
-- serp_results — one row per ranked item within a serp_run.
-- ---------------------------------------------------------------------------

create table serp_results (
  id uuid primary key default gen_random_uuid(),
  serp_run_id uuid not null references serp_runs (id) on delete cascade,
  position integer not null,
  domain text not null,
  url text not null,
  title text,
  description text,
  -- Kept as free text, not an enum: this is DataForSEO's own evolving result
  -- taxonomy (organic/featured_snippet/local_pack/...), not our domain
  -- concept — an enum here would mean an ALTER TYPE every time the provider
  -- adds a new result type.
  result_type text not null default 'organic',
  is_client_domain boolean not null default false,
  created_at timestamptz not null default now()
);

create index serp_results_serp_run_id_idx on serp_results (serp_run_id);
create index serp_results_domain_idx on serp_results (domain);

-- ---------------------------------------------------------------------------
-- competitor_domains — one row per (website, domain), aggregated/classified/
-- scored from serp_results by ANALYSE_COMPETITORS. unique(website_id,
-- domain) is what "prevents duplicate competitor domains per website".
-- ---------------------------------------------------------------------------

create table competitor_domains (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  website_id uuid not null references websites (id) on delete cascade,
  domain text not null,
  classification competitor_classification not null default 'UNKNOWN',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  appearances integer not null default 0,
  average_position numeric(6, 2),
  relevant_keyword_count integer not null default 0,
  -- See lib/serp/competitor-scoring.ts for the documented formula. An
  -- internal competitive-relevance score — NOT Google's authority/domain
  -- rating, never represented as such.
  relevance_score numeric(6, 2),
  updated_at timestamptz not null default now(),
  unique (website_id, domain)
);

create trigger competitor_domains_set_updated_at before update on competitor_domains
  for each row execute function set_updated_at();

create index competitor_domains_website_score_idx on competitor_domains (website_id, relevance_score desc);
create index competitor_domains_classification_idx on competitor_domains (classification);

-- ---------------------------------------------------------------------------
-- competitor_pages — structured metadata only for selected high-value
-- competitor pages (never body text/raw HTML — competitive analysis, not
-- content reproduction). unique(competitor_domain_id, url) prevents
-- duplicate rows on re-analysis.
-- ---------------------------------------------------------------------------

create table competitor_pages (
  id uuid primary key default gen_random_uuid(),
  competitor_domain_id uuid not null references competitor_domains (id) on delete cascade,
  url text not null,
  title text,
  meta_description text,
  h1 text,
  headings jsonb not null default '[]'::jsonb, -- same Heading[] shape as website_pages.headings
  word_count integer,
  has_structured_data boolean not null default false,
  structured_data_types text[] not null default '{}',
  -- Simple deterministic extraction from headings/title (word-frequency
  -- style, not real NLP/entity extraction) — a heuristic signal, documented
  -- as such, not a claimed semantic analysis.
  major_topics text[] not null default '{}',
  crawl_status job_status not null default 'PENDING', -- reused, not a new near-duplicate enum
  last_crawled_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (competitor_domain_id, url)
);

create trigger competitor_pages_set_updated_at before update on competitor_pages
  for each row execute function set_updated_at();

create index competitor_pages_competitor_domain_id_idx on competitor_pages (competitor_domain_id);
create index competitor_pages_crawl_status_idx on competitor_pages (crawl_status);

-- ---------------------------------------------------------------------------
-- provider_usage — the foundation for future cost tracking/dashboards. Not a
-- billing system; just a log of what was called, how much, and a documented
-- estimated cost (never a fabricated precise figure).
-- ---------------------------------------------------------------------------

create table provider_usage (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  website_id uuid references websites (id) on delete set null,
  provider text not null,
  operation text not null,
  units integer not null default 1,
  estimated_cost_usd numeric(10, 4),
  created_at timestamptz not null default now()
);

create index provider_usage_org_created_idx on provider_usage (organization_id, created_at desc);
create index provider_usage_website_created_idx on provider_usage (website_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table serp_runs enable row level security;
alter table serp_results enable row level security;
alter table competitor_domains enable row level security;
alter table competitor_pages enable row level security;
alter table provider_usage enable row level security;

create policy serp_runs_member_all on serp_runs
  for all using (is_org_member(organization_id)) with check (is_org_member(organization_id));

create policy serp_results_member_all on serp_results
  for all using (is_org_member((select organization_id from serp_runs where serp_runs.id = serp_run_id)))
  with check (is_org_member((select organization_id from serp_runs where serp_runs.id = serp_run_id)));

create policy competitor_domains_member_all on competitor_domains
  for all using (is_org_member(organization_id)) with check (is_org_member(organization_id));

create policy competitor_pages_member_all on competitor_pages
  for all using (is_org_member((select organization_id from competitor_domains where competitor_domains.id = competitor_domain_id)))
  with check (is_org_member((select organization_id from competitor_domains where competitor_domains.id = competitor_domain_id)));

create policy provider_usage_member_all on provider_usage
  for all using (is_org_member(organization_id)) with check (is_org_member(organization_id));
