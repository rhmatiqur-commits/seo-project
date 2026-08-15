-- Phase 2B: Keyword Intelligence.
-- Extends the existing `keywords` table (Phase 1) rather than replacing it,
-- and adds the minimum new tables needed: keyword_metrics (actual provider
-- data, never fabricated), keyword_page_matches (existing-page relevance),
-- keyword_opportunities (keyword-scoped scoring; high-value rows get
-- promoted into the existing seo_opportunities/seo_tasks system, not a
-- parallel one).

alter type keyword_source add value 'provider';

create type keyword_search_intent as enum (
  'INFORMATIONAL',
  'COMMERCIAL',
  'TRANSACTIONAL',
  'NAVIGATIONAL',
  'LOCAL',
  'UNKNOWN'
);

-- How a keyword was judged relevant to a page. 'ai_semantic' records that the
-- AI's holistic judgement (not lexical overlap) was the deciding signal —
-- this is a heuristic + AI-assisted process, not true embeddings-based
-- semantic search, which is out of scope for Phase 2B.
create type keyword_match_type as enum (
  'title',
  'h1',
  'heading',
  'url',
  'meta_description',
  'ai_semantic',
  'none'
);

-- ---------------------------------------------------------------------------
-- Extend the existing keywords table (Phase 1). Its `intent` free-text column
-- and `source`/`ai_suggested`/`manual` values are untouched — Phase 1 code
-- (lib/ai/seo-analysis.ts) keeps working unchanged.
-- ---------------------------------------------------------------------------

alter table keywords
  add column country text not null default 'GB',
  add column language text not null default 'en',
  add column search_intent keyword_search_intent not null default 'UNKNOWN',
  add column updated_at timestamptz not null default now();

create trigger keywords_set_updated_at before update on keywords
  for each row execute function set_updated_at();

-- Existing rows all share the new columns' defaults, so this is safe to swap.
alter table keywords drop constraint keywords_website_id_keyword_key;
alter table keywords add constraint keywords_website_id_keyword_country_language_key
  unique (website_id, keyword, country, language);

-- ---------------------------------------------------------------------------
-- Keyword discovery scheduling (mirrors websites.next_crawl_at/crawl_frequency_days
-- from Phase 2A — its own recurring cadence, configurable per website, not
-- chained off the crawl schedule).
-- ---------------------------------------------------------------------------

alter table websites
  add column next_keyword_discovery_at timestamptz,
  add column keyword_discovery_frequency_days integer not null default 30;

-- ---------------------------------------------------------------------------
-- keyword_metrics — actual provider data only. An absent row means "no data
-- collected," never a row of fabricated/zeroed-out numbers.
-- ---------------------------------------------------------------------------

create table keyword_metrics (
  id uuid primary key default gen_random_uuid(),
  keyword_id uuid not null references keywords (id) on delete cascade,
  search_volume integer,
  competition numeric(5, 2),
  cpc numeric(10, 2),
  metric_source text not null, -- e.g. a KeywordDataProvider's `.name` — never "estimated"/invented
  measured_at timestamptz not null default now()
);

create index keyword_metrics_keyword_id_idx on keyword_metrics (keyword_id);

-- ---------------------------------------------------------------------------
-- keyword_page_matches — relevance of an existing crawled page to a keyword.
-- ---------------------------------------------------------------------------

create table keyword_page_matches (
  id uuid primary key default gen_random_uuid(),
  keyword_id uuid not null references keywords (id) on delete cascade,
  page_id uuid not null references website_pages (id) on delete cascade,
  match_type keyword_match_type not null,
  relevance_score numeric(5, 2) not null,
  created_at timestamptz not null default now(),
  unique (keyword_id, page_id)
);

create index keyword_page_matches_keyword_id_idx on keyword_page_matches (keyword_id);
create index keyword_page_matches_page_id_idx on keyword_page_matches (page_id);

-- ---------------------------------------------------------------------------
-- keyword_opportunities — keyword-scoped scoring/recommendation. One live row
-- per (website, keyword); high-scoring rows get promoted (at most once, via
-- seo_opportunity_id) into the existing seo_opportunities/seo_tasks tables
-- rather than this being a second, parallel task system.
-- ---------------------------------------------------------------------------

create table keyword_opportunities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  website_id uuid not null references websites (id) on delete cascade,
  keyword_id uuid not null references keywords (id) on delete cascade,
  current_page_id uuid references website_pages (id) on delete set null,
  opportunity_type opportunity_type not null, -- reuses the existing Phase 1 enum, no translation layer
  business_relevance_score smallint, -- 1-5, AI-derived
  commercial_value_score smallint, -- 1-5, AI-derived
  difficulty_score smallint, -- 1-5, AI-estimated internal judgement — NOT a real keyword-difficulty metric
  opportunity_score numeric(5, 2) not null, -- see lib/keywords/scoring.ts for the documented formula
  recommended_action text not null,
  reasoning text not null, -- the AI's reasoning, stored separately from the raw scores
  status opportunity_status not null default 'new', -- reuses the existing Phase 1 enum
  seo_opportunity_id uuid references seo_opportunities (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (website_id, keyword_id)
);

create trigger keyword_opportunities_set_updated_at before update on keyword_opportunities
  for each row execute function set_updated_at();

create index keyword_opportunities_website_id_idx on keyword_opportunities (website_id);
create index keyword_opportunities_keyword_id_idx on keyword_opportunities (keyword_id);
create index keyword_opportunities_status_idx on keyword_opportunities (status);
create index keyword_opportunities_score_idx on keyword_opportunities (opportunity_score desc);

-- ---------------------------------------------------------------------------
-- Row Level Security — same patterns already used elsewhere in the schema.
-- ---------------------------------------------------------------------------

alter table keyword_metrics enable row level security;
alter table keyword_page_matches enable row level security;
alter table keyword_opportunities enable row level security;

create policy keyword_metrics_member_all on keyword_metrics
  for all using (is_org_member((select organization_id from keywords where keywords.id = keyword_id)))
  with check (is_org_member((select organization_id from keywords where keywords.id = keyword_id)));

create policy keyword_page_matches_member_all on keyword_page_matches
  for all using (is_org_member((select organization_id from keywords where keywords.id = keyword_id)))
  with check (is_org_member((select organization_id from keywords where keywords.id = keyword_id)));

create policy keyword_opportunities_member_all on keyword_opportunities
  for all using (is_org_member(organization_id)) with check (is_org_member(organization_id));
