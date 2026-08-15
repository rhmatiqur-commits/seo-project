-- Phase 2C: Google Search Console integration.
-- Per-website OAuth connection (one Google account/property per website, not
-- one shared static credential — required for genuine multi-tenant
-- isolation) plus the actual measured metrics it pulls in. This is the
-- platform's first real/external data source, distinct from crawled data,
-- AI-derived opportunities, and provider-estimated keyword metrics.

-- ---------------------------------------------------------------------------
-- search_console_connections — one row per website. `site_url` is null until
-- the admin picks a property from the site-picker step (a Google account can
-- have multiple verified GSC properties). Tokens are plaintext columns,
-- service-role-only access — same trust model already used for
-- SUPABASE_SERVICE_ROLE_KEY/AI provider keys as env vars; field-level
-- encryption is a flagged future hardening, not blocking for this phase.
-- ---------------------------------------------------------------------------

create type search_console_connection_status as enum (
  'pending_site_selection',
  'active',
  'error'
);

create table search_console_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  website_id uuid not null references websites (id) on delete cascade,
  site_url text,
  refresh_token text not null,
  access_token text,
  access_token_expires_at timestamptz,
  scope text not null,
  status search_console_connection_status not null default 'pending_site_selection',
  last_sync_error text,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (website_id)
);

create trigger search_console_connections_set_updated_at before update on search_console_connections
  for each row execute function set_updated_at();

create index search_console_connections_website_id_idx on search_console_connections (website_id);

-- ---------------------------------------------------------------------------
-- Search Console sync scheduling (mirrors next_crawl_at/crawl_frequency_days
-- and next_keyword_discovery_at/keyword_discovery_frequency_days) — its own
-- independent, configurable cadence, not chained off the other schedules.
-- ---------------------------------------------------------------------------

alter table websites
  add column next_search_console_sync_at timestamptz,
  add column search_console_sync_frequency_days integer not null default 1;

-- ---------------------------------------------------------------------------
-- search_console_metrics — actual Google Search Console data only. Rows are
-- upserted on (website_id, date, query, page_url) so re-syncing overlapping
-- date ranges never duplicates data.
-- ---------------------------------------------------------------------------

create table search_console_metrics (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  website_id uuid not null references websites (id) on delete cascade,
  date date not null,
  query text,
  page_url text,
  clicks integer not null default 0,
  impressions integer not null default 0,
  ctr numeric(6, 4) not null default 0,
  position numeric(6, 2),
  fetched_at timestamptz not null default now(),
  unique (website_id, date, query, page_url)
);

create index search_console_metrics_website_id_idx on search_console_metrics (website_id);
create index search_console_metrics_date_idx on search_console_metrics (date);

-- ---------------------------------------------------------------------------
-- Row Level Security — same direct-organization_id pattern already used for
-- seo_opportunities/keyword_opportunities.
-- ---------------------------------------------------------------------------

alter table search_console_connections enable row level security;
alter table search_console_metrics enable row level security;

create policy search_console_connections_member_all on search_console_connections
  for all using (is_org_member(organization_id)) with check (is_org_member(organization_id));

create policy search_console_metrics_member_all on search_console_metrics
  for all using (is_org_member(organization_id)) with check (is_org_member(organization_id));
