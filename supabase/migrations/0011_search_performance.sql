-- Phase 2D: SEO Decision Engine.
-- One table, produced by the ANALYSE_SEARCH_PERFORMANCE job: combines pages,
-- keywords, keyword metrics, and real Search Console data into deterministic,
-- explainable opportunities. `signals` snapshots exactly the measured/
-- deterministic inputs used to compute the score, kept separate from
-- `ai_rationale`/`ai_risk_notes` (optional, additive AI interpretation) so the
-- source of every field stays unambiguous. High-scoring rows are promoted
-- into the existing seo_opportunities/seo_tasks system via seo_opportunity_id
-- (same "one task system, two feeders" pattern as keyword_opportunities).

create type search_performance_detector_type as enum (
  'PAGE_TWO_OPPORTUNITY',
  'HIGH_IMPRESSIONS_LOW_CTR',
  'MISSING_PAGE',
  'DECLINING_KEYWORD',
  'EMERGING_KEYWORD',
  'CONTENT_GAP',
  'INTERNAL_LINK_OPPORTUNITY'
);

create table search_performance_opportunities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  website_id uuid not null references websites (id) on delete cascade,
  detector_type search_performance_detector_type not null,
  keyword_id uuid references keywords (id) on delete cascade,
  page_id uuid references website_pages (id) on delete set null,
  -- For INTERNAL_LINK_OPPORTUNITY: the page that should add a link to page_id.
  -- Null for every other detector.
  related_page_id uuid references website_pages (id) on delete set null,
  -- Deterministic identity string (see lib/search-performance/dedupe-key.ts)
  -- so re-running analysis upserts instead of duplicating. A plain multi-
  -- column unique constraint doesn't work here because identity varies by
  -- detector and Postgres treats NULLs as distinct.
  dedupe_key text not null,
  -- Snapshot of the measured/deterministic inputs the score was computed
  -- from (position, impressions, clicks, ctr, period deltas, page-match
  -- relevance, etc.) — see lib/search-performance/scoring.ts for the formula.
  signals jsonb not null default '{}'::jsonb,
  opportunity_score numeric(6, 2) not null,
  recommended_action opportunity_type not null, -- reuses the existing Phase 1 enum
  reasoning text not null, -- deterministic, human-readable explanation — filled immediately, never depends on AI
  ai_rationale text, -- optional AI interpretation, null until (and unless) analysed
  ai_risk_notes text, -- e.g. cannibalisation warnings
  ai_analysed_at timestamptz,
  status opportunity_status not null default 'new', -- reuses the existing Phase 1 enum
  seo_opportunity_id uuid references seo_opportunities (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (website_id, dedupe_key)
);

create trigger search_performance_opportunities_set_updated_at before update on search_performance_opportunities
  for each row execute function set_updated_at();

create index search_performance_opportunities_website_id_idx on search_performance_opportunities (website_id);
create index search_performance_opportunities_detector_type_idx on search_performance_opportunities (detector_type);
create index search_performance_opportunities_status_idx on search_performance_opportunities (status);
create index search_performance_opportunities_score_idx on search_performance_opportunities (opportunity_score desc);

alter table search_performance_opportunities enable row level security;

create policy search_performance_opportunities_member_all on search_performance_opportunities
  for all using (is_org_member(organization_id)) with check (is_org_member(organization_id));
