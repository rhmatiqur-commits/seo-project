-- Phase 6: Autonomous SEO Optimisation Loop.
--
-- Connects an already-executed SEO action back to its real Google Search
-- Console performance: SEO ACTION -> PUBLICATION -> GOOGLE PERFORMANCE ->
-- SEARCH CONSOLE -> MEASUREMENT -> OUTCOME ANALYSIS -> NEXT SEO DECISION ->
-- NEW TASK.
--
-- Deliberately reuses the existing chain (seo_opportunities -> seo_tasks ->
-- content_briefs -> content_versions -> content_publications ->
-- search_console_metrics) rather than building a parallel analytics system —
-- every FK below points at a table that already exists. `seo_actions` is the
-- new spine that ties them together with a target URL/keyword so outcome
-- measurement has something concrete to look up in search_console_metrics.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

-- The 8 action types from the spec. Deliberately its own enum, not a reuse of
-- opportunity_type or search_performance_detector_type, because it's a
-- specific 8-value subset mixing both vocabularies (e.g. CONTENT_GAP is a
-- detector_type, IMPROVE_CTR is an opportunity_type) — this is the type an
-- *action* was, not the type of opportunity/detector that produced it.
create type seo_action_type as enum (
  'CREATE_NEW_PAGE',
  'OPTIMISE_EXISTING_PAGE',
  'IMPROVE_CTR',
  'IMPROVE_INTERNAL_LINKING',
  'CONTENT_GAP',
  'COMPETITOR_CONTENT_GAP',
  'COMPETITOR_RANKING_GAP',
  'TECHNICAL_FIX'
);

-- PENDING: seo_actions row exists but the underlying change hasn't happened
-- yet (should be rare — actions are normally created at the moment of
-- execution, see lib/jobs/handlers/publish-content.ts and
-- app/admin/actions.ts's updateTaskStatusAction). EXECUTED: the change is
-- live (content published, task completed) and executed_at is set — this is
-- what makes an action eligible for baseline capture/measurement.
create type seo_action_status as enum ('PENDING', 'APPROVED', 'EXECUTED', 'CANCELLED');

-- Per-organisation/website autonomy configuration (spec section 14). Phase 6
-- only ever reads this to decide whether to *recommend* vs *do* something —
-- no code path in this phase auto-publishes or auto-modifies content
-- regardless of this value; AI_PREPARES/AI_EXECUTES are schema-ready for a
-- later phase to actually implement against.
create type autonomy_level as enum ('MANUAL', 'AI_RECOMMENDS', 'AI_PREPARES', 'AI_EXECUTES');

-- Deterministic outcome classification (spec section 6) — never a single
-- metric's verdict; see lib/outcomes/classify.ts.
create type outcome_classification as enum ('POSITIVE', 'NEGATIVE', 'MIXED', 'INCONCLUSIVE', 'INSUFFICIENT_DATA');

-- What the Next Action Engine (spec section 13) recommends. Deliberately
-- small and specific rather than open text — a recommendation drives, at
-- most, one follow-up task via the existing seo_opportunities/seo_tasks
-- system, never a direct content mutation.
create type outcome_recommendation as enum ('MONITOR', 'INVESTIGATE_CTR', 'DIAGNOSE_DECLINE', 'WAIT_FOR_MORE_DATA');

-- New-page lifecycle stages (spec section 8). VISIBLE means "Search Console
-- has shown impressions for this URL" — evidence of visibility, not a claim
-- about Google's indexing mechanics (see lib/outcomes/lifecycle.ts).
create type page_lifecycle_stage as enum ('NEW', 'DISCOVERED', 'VISIBLE', 'GROWING', 'STABLE', 'DECLINING');

create type seo_alert_type as enum (
  'RANKING_DECLINE',
  'TRAFFIC_DECLINE',
  'SUCCESSFUL_IMPROVEMENT',
  'NEW_HIGH_VALUE_KEYWORD',
  'NEW_PAGE_TRACTION'
);
create type seo_alert_severity as enum ('info', 'warning', 'critical');
create type seo_alert_status as enum ('open', 'acknowledged');

-- ---------------------------------------------------------------------------
-- websites: autonomy configuration + this phase's own independent recurring
-- schedule, same pattern as every prior phase's next_*_at/*_frequency_days
-- pair (see 0004/0006/0008/0012).
-- ---------------------------------------------------------------------------

alter table websites
  add column autonomy_level autonomy_level not null default 'AI_RECOMMENDS',
  add column next_action_outcomes_at timestamptz,
  add column action_outcomes_frequency_days integer not null default 1;

-- ---------------------------------------------------------------------------
-- seo_actions — one row per executed SEO action. Every FK is nullable
-- because "do not assume every action produces a published page" (spec
-- section 2): a TECHNICAL_FIX or IMPROVE_INTERNAL_LINKING action may have no
-- content_brief/content_version/content_publication at all, only a
-- seo_task_id.
-- ---------------------------------------------------------------------------

create table seo_actions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  website_id uuid not null references websites (id) on delete cascade,
  seo_opportunity_id uuid references seo_opportunities (id) on delete set null,
  seo_task_id uuid references seo_tasks (id) on delete set null,
  content_brief_id uuid references content_briefs (id) on delete set null,
  content_version_id uuid references content_versions (id) on delete set null,
  content_publication_id uuid references content_publications (id) on delete set null,
  action_type seo_action_type not null,
  status seo_action_status not null default 'PENDING',
  target_url text,
  target_keyword_id uuid references keywords (id) on delete set null,
  -- Denormalized, same reasoning as content_briefs.primary_keyword: survives
  -- even if the keyword row is later removed, and measurement needs the
  -- literal text to match against search_console_metrics.query.
  target_keyword_text text,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  -- Publication/action completion date — what baseline/measurement windows
  -- are computed relative to.
  executed_at timestamptz,
  updated_at timestamptz not null default now(),
  -- Baseline snapshot (spec section 3) — captured once by the analysis job
  -- and never overwritten after baseline_captured_at is set, so "pre-action
  -- data" stays exactly that even if the job runs again later.
  baseline_captured_at timestamptz,
  baseline_window_days integer,
  baseline_start_date date,
  baseline_end_date date,
  baseline_metrics jsonb not null default '{}'::jsonb,
  -- Experimental tracking foundation (spec section 16) — nullable, not
  -- populated by any default flow in this phase, ready for a future
  -- experiment-authoring UI. Deliberately no "is_experiment" boolean or
  -- control/variant columns yet — that's real A/B testing, explicitly out of
  -- scope for Phase 6.
  hypothesis text,
  expected_outcome text,
  measurement_window_days integer,
  conclusion text
);

create trigger seo_actions_set_updated_at before update on seo_actions
  for each row execute function set_updated_at();

create index seo_actions_website_id_idx on seo_actions (website_id);
create index seo_actions_status_idx on seo_actions (status);
create index seo_actions_executed_at_idx on seo_actions (executed_at);
create index seo_actions_seo_task_id_idx on seo_actions (seo_task_id);

-- Duplicate-prevention: a content_publication has at most one seo_action
-- (mirrors content_publications itself being one row per version's
-- lineage) — the publish-completion hook checks for an existing row before
-- inserting, this is the DB-level backstop.
create unique index seo_actions_content_publication_id_uidx on seo_actions (content_publication_id) where content_publication_id is not null;

-- ---------------------------------------------------------------------------
-- seo_action_outcomes — one row per (action, measurement window). Multiple
-- windows (7/14/28/56 days) can exist for the same action over time as more
-- data becomes available — never overwritten with a shorter window's numbers,
-- each window's own row stays exactly what was computed for it.
-- ---------------------------------------------------------------------------

create table seo_action_outcomes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  website_id uuid not null references websites (id) on delete cascade,
  seo_action_id uuid not null references seo_actions (id) on delete cascade,
  measurement_window_days integer not null,
  window_start date not null,
  window_end date not null,
  -- Copied from seo_actions.baseline_metrics at computation time, so this row
  -- is self-contained even if a later run somehow changed the action's own
  -- snapshot (it shouldn't, but this keeps history honest either way).
  baseline_metrics jsonb not null default '{}'::jsonb,
  current_metrics jsonb not null default '{}'::jsonb,
  -- {clicksChange, clicksChangePct, impressionsChange, impressionsChangePct,
  -- ctrChangePoints, positionChange, ...} — see lib/outcomes/deltas.ts.
  -- positionChange follows "lower position number = improvement":
  -- positionChange = baselinePosition - currentPosition, so positive = better.
  deltas jsonb not null default '{}'::jsonb,
  -- Deterministic minimum-data gate (spec section 7) — AI can never override
  -- this to false when it's true, or vice versa; it's computed before any AI
  -- call and the AI prompt/schema has no field that could contradict it.
  data_sufficient boolean not null,
  classification outcome_classification not null,
  classification_reasoning text not null,
  recommendation outcome_recommendation not null,
  -- Only meaningful for CREATE_NEW_PAGE actions; null for OPTIMISE_EXISTING_PAGE etc.
  page_lifecycle_stage page_lifecycle_stage,
  -- Optional, additive AI interpretation — kept in separate columns from
  -- every deterministic field above, same separation as
  -- search_performance_opportunities.ai_rationale/ai_risk_notes.
  ai_interpretation text,
  ai_risk_notes text,
  ai_analysed_at timestamptz,
  -- Set once a follow-up seo_tasks row has been created from this outcome —
  -- the duplicate-follow-up-task-prevention mechanism (spec section 15).
  follow_up_task_id uuid references seo_tasks (id) on delete set null,
  computed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (seo_action_id, measurement_window_days)
);

create trigger seo_action_outcomes_set_updated_at before update on seo_action_outcomes
  for each row execute function set_updated_at();

create index seo_action_outcomes_seo_action_id_idx on seo_action_outcomes (seo_action_id);
create index seo_action_outcomes_website_id_idx on seo_action_outcomes (website_id);
create index seo_action_outcomes_classification_idx on seo_action_outcomes (classification);

-- ---------------------------------------------------------------------------
-- seo_alerts — internal notifications, only created when a configurable
-- threshold is exceeded (lib/outcomes/alerts.ts), deduped per outcome row so
-- re-running analysis never spams the same alert twice.
-- ---------------------------------------------------------------------------

create table seo_alerts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  website_id uuid not null references websites (id) on delete cascade,
  seo_action_id uuid references seo_actions (id) on delete cascade,
  seo_action_outcome_id uuid references seo_action_outcomes (id) on delete cascade,
  alert_type seo_alert_type not null,
  severity seo_alert_severity not null,
  message text not null,
  details jsonb not null default '{}'::jsonb,
  status seo_alert_status not null default 'open',
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz
);

create index seo_alerts_website_id_idx on seo_alerts (website_id);
create index seo_alerts_status_idx on seo_alerts (status);
create unique index seo_alerts_outcome_type_uidx on seo_alerts (seo_action_outcome_id, alert_type) where seo_action_outcome_id is not null;

-- ---------------------------------------------------------------------------
-- Row Level Security — same is_org_member(organization_id) pattern as every
-- other tenant table.
-- ---------------------------------------------------------------------------

alter table seo_actions enable row level security;
alter table seo_action_outcomes enable row level security;
alter table seo_alerts enable row level security;

create policy seo_actions_member_all on seo_actions
  for all using (is_org_member(organization_id)) with check (is_org_member(organization_id));

create policy seo_action_outcomes_member_all on seo_action_outcomes
  for all using (is_org_member(organization_id)) with check (is_org_member(organization_id));

create policy seo_alerts_member_all on seo_alerts
  for all using (is_org_member(organization_id)) with check (is_org_member(organization_id));
