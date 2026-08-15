# AI SEO Automation Platform

A multi-tenant foundation for a productised AI SEO service.

**Phase 1** delivered one working, end-to-end pipeline, manually triggered:

```
CLIENT → WEBSITE → CRAWL WEBSITE → STORE WEBSITE DATA → ANALYSE WEBSITE → IDENTIFY SEO OPPORTUNITIES → CREATE SEO TASKS
```

**Phase 2A** makes that pipeline advance itself, on a schedule, safely re-runnable:

```
SCHEDULER → JOB QUEUE → WORKER → ACTION → DATABASE → NEXT SCHEDULED RUN
```

A successful `CRAWL_WEBSITE` job automatically enqueues `RUN_SEO_AUDIT`, which automatically enqueues `GENERATE_SEO_OPPORTUNITIES` — regardless of whether the crawl was started by the scheduler, the admin UI, or the API. Manual triggers still work exactly as in Phase 1.

**Phase 2B** adds a Keyword Intelligence layer on its own recurring schedule per website:

```
KEYWORD_DISCOVERY → keyword candidates (AI + provider) → page matching → opportunity scoring → promote high-value ones into seo_opportunities/seo_tasks
```

It reuses the existing `seo_opportunities`/`seo_tasks` system rather than building a parallel one — only keyword opportunities above a score threshold become real tasks.

**Phase 2C** connects each client's own Google Search Console property, per-website OAuth:

```
Admin connects GSC property → SEARCH_CONSOLE_SYNC (own schedule) → real clicks/impressions/CTR/position stored, labeled as measured data
```

This is the platform's first **real, external, measured** data source — distinct from crawled data, AI-derived opportunities, and provider-estimated keyword metrics. Display-only in this phase; feeding it into keyword-opportunity scoring is a Phase 2D follow-up.

**Phase 2D** combines everything the platform already knows into a deterministic SEO Decision Engine:

```
pages + keywords + real GSC data → 7 deterministic detectors → transparent scoring → optional AI interpretation → seo_opportunities/seo_tasks
```

Every number (position, impressions, clicks, CTR, period deltas, the opportunity score itself) is computed in TypeScript, never by the AI — AI is used only to explain *why* an already-detected, already-scored opportunity matters. This phase also closes a real security gap: `/api/**` was previously reachable with zero authentication (see `SECURITY_AUDIT.md`).

CV Central is the first test client, but nothing in the code is CV-Central-specific — it's seeded through the same `createOrganization`/`createWebsite` calls any client onboarding would use.

## Architecture

- **Framework**: Next.js 16 (App Router) + TypeScript. One app serves both the JSON API (`app/api/**`, Route Handlers) and a deliberately plain internal admin UI (`app/admin/**`, server components + server actions — no client-side framework, no design investment).
- **Database/auth**: Supabase (Postgres + Auth + RLS). The Next.js server talks to Supabase with the **service-role key** (`lib/supabase/server.ts`) — it's a trusted backend, so Phase 1 doesn't route through RLS. The schema and RLS policies are written now so Phase 2 can expose data straight to logged-in client users later without a schema change.
- **Crawler**: `lib/crawler/*` — built-in `fetch` + `cheerio` for HTML parsing + `robots-parser` for robots.txt. No headless browser (no JS rendering) — a known Phase 1 limitation.
- **SEO audit**: `lib/audit/*` — a set of small, pure rule functions (`lib/audit/rules/*.ts`) run over crawled pages/links by `lib/audit/engine.ts`.
- **AI**: `lib/ai/provider.ts` defines an `AIProvider` interface (`generateStructuredOutput`, `generateText`, `analyse`); `lib/ai/anthropic-provider.ts` is the only implementation today, using Claude's tool-use for structured output. `lib/ai/seo-analysis.ts` is the orchestration: build a compact structured summary from the DB → call the provider → validate with zod → dedupe → persist opportunities + tasks.
- **Jobs**: `lib/jobs/*` — a `jobs` table + an in-process runner, no Redis/queue yet. `lib/jobs/trigger.ts` (fire-and-forget) is still what manual admin/API triggers use; `processPendingJobs` (`lib/jobs/runner.ts`) is a bounded worker loop that explicitly drains the queue rather than relying on a detached promise — used by the scheduler, `/api/jobs/process`, and `npm run jobs:sweep`. `processJob` enqueues the next pipeline stage on `COMPLETED` (`lib/jobs/policy.ts` has the pure due/stale/retry/next-stage decision logic, unit-tested in `policy.test.ts`).
- **Scheduler**: `lib/jobs/scheduler.ts`'s `runScheduledSweep()` — recovers stale jobs, requeues retry-eligible failures, enqueues `CRAWL_WEBSITE` and `KEYWORD_DISCOVERY` for due active websites (independent schedules), runs the worker loop, records a `scheduler_runs` row. Exposed at `POST/GET /api/scheduler/run` (bearer-secret gated) and called on a cron by `.github/workflows/scheduler.yml`. Designed so a real queue (BullMQ/Redis) could later replace the worker loop without touching `lib/jobs/handlers/*` — handlers only depend on the `JobHandler` signature, never on how they're invoked.
- **Keyword Intelligence** (Phase 2B): `lib/keywords/*` — pure modules (normalize/match/score/merge) plus a `KeywordDataProvider` abstraction (`lib/keywords/provider.ts`), mirroring `AIProvider`'s shape exactly. `lib/jobs/handlers/keyword-discovery.ts` orchestrates it all and reuses Phase 1's `insertOpportunity`/`insertTask`/`linkOpportunityKeyword` to promote high-value keyword opportunities into the existing task system. See the dedicated section below.
- **Search Console integration** (Phase 2C): `lib/search-console/*` — hand-rolled `fetch` wrappers around Google's OAuth and Search Console (Webmasters v3) REST endpoints (no `googleapis` dependency), a signed/expiring OAuth `state` param for the unauthenticated callback route, and a pure row-normalizer. `lib/jobs/handlers/search-console-sync.ts` refreshes the access token when needed and upserts real metrics. See the dedicated section below.
- **SEO Decision Engine** (Phase 2D): `lib/search-performance/*` — 7 pure detector modules, a historical-comparison aggregator, a documented scoring formula, and a deterministic dedupe-key builder for idempotent upserts. `lib/jobs/handlers/analyse-search-performance.ts` orchestrates detection → scoring → an optional bounded AI-interpretation pass → promotion into `seo_opportunities`/`seo_tasks`. See the dedicated section below.
- **API authorization** (Phase 2D): `proxy.ts`'s Basic Auth now also covers `/api/**` (previously `/admin/**` only); `lib/api/authorize.ts` guards against a client-supplied organization id being trusted over the resource's real owner. See `SECURITY_AUDIT.md` for the full audit and its honestly-documented limits.

```
app/
  admin/            internal admin UI (server components + server actions)
    automation/      job stats, scheduler runs, per-website schedule, manual controls
    websites/[id]/keywords/  Keyword Intelligence: stats, filters, run-discovery button
    websites/[id]/search-console/  Search Console: connect/site-picker, stats, metrics table
    websites/[id]/search-performance/  SEO Decision Engine: opportunities table, filters, status updates
  api/               JSON API route handlers (Basic-Auth-gated, Phase 2D — see SECURITY_AUDIT.md)
    scheduler/run/    CRON_SECRET-gated scheduled sweep entrypoint (excluded from Basic Auth)
    websites/[id]/keyword-discovery/  manual KEYWORD_DISCOVERY trigger
    websites/[id]/search-console-sync/  manual SEARCH_CONSOLE_SYNC trigger
    websites/[id]/search-performance-analysis/  manual ANALYSE_SEARCH_PERFORMANCE trigger
    auth/google-search-console/start|callback/  OAuth flow (callback excluded from Basic Auth by necessity; state-signed)
lib/
  supabase/          server-side client + generated Database types
  crawler/            crawl engine
  audit/               technical SEO rules + engine
  ai/                    provider abstraction, schemas, prompts, analysis service
  jobs/                 job runner, scheduler, pure policy/decision functions, per-job-type handlers
  keywords/              keyword provider abstraction + pure normalize/match/score/merge modules
  search-console/        OAuth/API clients, signed state param, pure row-normalizer
  search-performance/    7 pure detectors, comparison/scoring/dedupe-key modules (Phase 2D)
  api/                   lib/api/authorize.ts (IDOR guard), lib/api/respond.ts (route helpers)
  db/                    typed query helpers, one file per entity
supabase/migrations/  versioned SQL (source of truth; applied via Supabase MCP)
scripts/               seed.ts, run-pending-jobs.ts, run-scheduler.ts
SECURITY_AUDIT.md      Phase 2D API authorization audit — full route inventory + honest limitations
```

## Database schema

22 tables, UUID primary keys, `created_at`/`updated_at` timestamps, RLS enabled everywhere. See `supabase/migrations/` (`0001_init.sql` through `0011_search_performance.sql`) for the full source of truth.

- **organizations**, **memberships** (user↔org, role) — core multi-tenancy.
- **websites** — per-org, with crawl limits (`crawl_max_pages`, `crawl_max_depth`), last-known robots.txt/sitemap availability, and three **independent** recurring schedules: `next_crawl_at`/`crawl_frequency_days` (default 7 — weekly), `next_keyword_discovery_at`/`keyword_discovery_frequency_days` (default 30 — monthly, Phase 2B), and `next_search_console_sync_at`/`search_console_sync_frequency_days` (default 1 — daily, Phase 2C). `status='active'` doubles as the "eligible for scheduling" flag for all three; `paused`/`archived` websites are skipped. `ANALYSE_SEARCH_PERFORMANCE` (Phase 2D) has no schedule column of its own — it chains after a completed `SEARCH_CONSOLE_SYNC` instead (see "Scheduler" below).
- **jobs** — generic async job queue (`job_type`, `status`, `priority`, `retry_count`/`max_retries`, `payload`, `result`, timestamps). A partial unique index on `idempotency_key` (scoped to `PENDING`/`PROCESSING` only — see migration `0003`) is the mechanism that prevents duplicate concurrent jobs of the same type for the same website, reused as-is by every schedule.
- **scheduler_runs** — one row per sweep (Phase 2A): counts of websites checked, crawl jobs created, jobs processed/completed/failed/retried, stale-recovered, timestamps, error (keyword-discovery counts live in the `summary` jsonb column). Platform-internal (not tenant data) — RLS enabled with no policies, service-role only.
- **website_pages** — one row per crawled URL: status, title, meta description, H1, headings (jsonb), word count, canonical, noindex, structured-data types, image/link counts, orphan flag, redirect chain (jsonb).
- **page_links** — the internal/external link graph between crawled pages.
- **seo_audits** / **seo_issues** — one audit run → many issues, each with severity/category/recommended action.
- **keywords** — per-org/website, unique on `(website_id, keyword, country, language)`. `source` distinguishes `'ai_suggested'` / `'provider'` / `'manual'`; `search_intent` is one of the 6 Phase 2B categories (`INFORMATIONAL`/`COMMERCIAL`/`TRANSACTIONAL`/`NAVIGATIONAL`/`LOCAL`/`UNKNOWN`).
- **keyword_metrics** (Phase 2B) — real provider data only (search volume/competition/CPC + `metric_source`). An absent row means "no data collected," never a row of fabricated numbers.
- **keyword_page_matches** (Phase 2B) — a keyword's best-matching existing page, `match_type` (title/h1/heading/url/meta_description/ai_semantic/none) + `relevance_score`.
- **keyword_opportunities** (Phase 2B) — one row per (website, keyword): AI-derived 1-5 scores, computed `opportunity_score`, `recommended_action`, `reasoning`, and a `seo_opportunity_id` back-reference once promoted into the task system (null until then).
- **search_console_connections** (Phase 2C) — one row per website (`unique(website_id)`): OAuth `refresh_token`/`access_token`/expiry, the chosen `site_url` (null until the site-picker step), `status` (`pending_site_selection`/`active`/`error`), `last_sync_error`. Tokens are plaintext columns, service-role-only access — same trust model already used for API keys as env vars; field-level encryption is a flagged future hardening.
- **search_console_metrics** (Phase 2C) — actual Google data only: `date`/`query`/`page_url`/`clicks`/`impressions`/`ctr`/`position`, unique on `(website_id, date, query, page_url)` so re-syncing overlapping date ranges never duplicates rows.
- **search_performance_opportunities** (Phase 2D) — one row per (website, detector, subject): `detector_type` (7 values), nullable `keyword_id`/`page_id`/`related_page_id`, a `signals` jsonb snapshot of exactly the measured/deterministic inputs the score was computed from, `opportunity_score`, `recommended_action`, deterministic `reasoning`, optional `ai_rationale`/`ai_risk_notes`/`ai_analysed_at`, and a `seo_opportunity_id` back-reference once promoted. Idempotency is via a deterministic `dedupe_key` (unique per website), not a multi-column constraint — see "SEO Decision Engine" below for why.
- **competitors** — manual entry only; no scraping.
- **seo_opportunities** — recommendations (`CREATE_NEW_PAGE` / `OPTIMISE_EXISTING_PAGE` / `TECHNICAL_FIX` / `INTERNAL_LINKING` / `RESEARCH_REQUIRED`, plus Phase 2D's `IMPROVE_CTR` / `INVESTIGATE_DECLINE` / `INVESTIGATE_OPPORTUNITY` / `IMPROVE_INTERNAL_LINKING`), with `priority_score` + `priority_components` and an `ai_job_id` back-reference. Populated by Phase 1's page-level AI analysis, Phase 2B's keyword-opportunity promotion, and Phase 2D's search-performance-opportunity promotion — one system, three feeders.
- **opportunity_keywords** — join table (Phase 1), reused as-is by Phase 2B to link a promoted keyword to its `seo_opportunities` row.
- **seo_tasks** — one task per stored opportunity (also usable standalone later), with its own status lifecycle.
- **ai_jobs** — one row per individual AI provider call: provider, model, prompt version, token usage, latency, status, result. Distinct from `jobs` — a single `GENERATE_SEO_OPPORTUNITIES`/`KEYWORD_DISCOVERY` job makes exactly one AI call today, but the schema allows more later without migration.

RLS: every tenant table is scoped via an `is_org_member(organization_id)` helper function checked against `memberships` (tables without a direct `organization_id`, like `keyword_metrics`/`keyword_page_matches`, join through `keywords` to reach it). The service-role key bypasses this by design (Phase 1); it exists for Phase 2 client-facing access.

**Job-type note**: `ANALYSE_WEBSITE` and `GENERATE_SEO_OPPORTUNITIES` currently run the exact same handler (`lib/jobs/handlers/opportunities.ts`) — one AI pass that classifies pages/gaps and produces opportunities+tasks together. They're kept as distinct job types so a future phase can split "analysis" from "opportunity generation" (e.g. once a keyword-data provider justifies a separate, richer analysis step) without a job-model change.

## Environment variables

Copy `.env.example` to `.env.local` and fill in:

| Variable | Where to get it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase dashboard → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Same page — **secret**, server-only, never expose to the browser |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Same page (unused server-side today; reserved for Phase 2) |
| `AI_PROVIDER` | `anthropic` (default) or `openai` — selects which `lib/ai/*-provider.ts` is used |
| `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` | Required when `AI_PROVIDER=anthropic`. https://console.anthropic.com/settings/keys, model defaults to `claude-sonnet-4-5` |
| `OPENAI_API_KEY` / `OPENAI_MODEL` | Required when `AI_PROVIDER=openai`. https://platform.openai.com/api-keys, model defaults to `gpt-4o` |
| `ADMIN_PASSWORD` | Any value — gates `/admin` via HTTP Basic Auth (Phase 1 has no per-user login) |
| `CRAWLER_USER_AGENT` | Optional override; defaults to `SEOPlatformBot/0.1 (+https://example.com/bot)` |
| `CRON_SECRET` | Any long random value (e.g. `openssl rand -hex 32`) — gates `/api/scheduler/run`. Matches Vercel Cron's own convention. |
| `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` | Optional — only needed for the Search Console integration (Phase 2C). See "Search Console integration" below for how to create these in Google Cloud Console. Everything else works with zero GSC setup. |

## Local development

```bash
npm install
npm run dev       # http://localhost:3000 (admin at /admin, prompts for ADMIN_PASSWORD via Basic Auth)
npm run typecheck
npm test           # pure-function unit tests: audit rules, job scheduling policy, keyword/search-console/search-performance modules, API authorization guard (node:test)
```

## Supabase setup

This repo was built against a dedicated Supabase project (`seo-automation-platform`). Migrations live in `supabase/migrations/` and were applied via the Supabase MCP `apply_migration` tool; treat that directory as the source of truth if you set up a new project — apply `0001_init.sql` then `0002_security_hardening.sql` in order (via the SQL editor, the Supabase CLI, or MCP).

To regenerate `lib/supabase/types.ts` after a schema change, use the Supabase MCP `generate_typescript_types` tool (or `supabase gen types typescript` if you have the CLI installed) and reconcile it with the hand-added convenience exports at the bottom of that file (`Heading`, `RedirectHop`, `WebsitePage`, `jsonb()`).

## AI provider setup

`lib/ai/provider.ts` is the only interface call sites depend on. Two implementations exist today — `lib/ai/anthropic-provider.ts` (Claude, via tool-use) and `lib/ai/openai-provider.ts` (via `response_format: json_schema` strict mode) — and `lib/ai/get-provider.ts` picks between them based on `AI_PROVIDER`. Adding a third provider means implementing `AIProvider` and adding one case to that switch; nothing in `lib/ai/seo-analysis.ts` or the job handlers needs to change either way.

AI safety/quality constraints are enforced structurally, not just by prompt wording:
- The opportunity schema (`lib/ai/schemas.ts`) has no field for search volume, rankings, or competitor metrics — there's nowhere for the model to put invented numbers, and the zod `.parse()` each provider runs on the result is what actually gets persisted.
- Arrays are capped (`MAX_OPPORTUNITIES_PER_RUN`, `MAX_NEW_PAGES_PER_RUN`) so one run can't flood the platform with new-page recommendations.
- `lib/ai/seo-analysis.ts` dedupes against existing open opportunities by normalized title before inserting, so re-running analysis doesn't pile up near-identical recommendations.
- `target_url` on a recommendation is only trusted if it matches a URL actually crawled; otherwise it's dropped rather than trusting a possibly-hallucinated URL.

## Running a crawl

Via the admin UI: open a website page (`/admin/websites/[id]`) and click **Crawl website**. Via the API:

```bash
curl -X POST http://localhost:3000/api/websites/<website-id>/crawl -u admin:$ADMIN_PASSWORD
```

This creates a `jobs` row (`job_type = CRAWL_WEBSITE`) and starts processing it immediately in the background — the request returns right away with a `jobId`. Poll `GET /api/jobs/<jobId>` (or refresh the admin page) to see it move `PENDING → PROCESSING → COMPLETED`. Crawl limits (`crawl_max_pages`, `crawl_max_depth`, set per-website) are hard-capped in `lib/crawler/limits.ts` regardless of what's configured, so a misconfigured website can't trigger an uncontrolled crawl.

## Running an SEO audit

Requires a completed crawl first (the button is disabled until pages exist). Click **Run SEO audit**, or:

```bash
curl -X POST http://localhost:3000/api/websites/<website-id>/audit -u admin:$ADMIN_PASSWORD
```

Results land in `seo_audits` (one row per run) and `seo_issues` (one row per finding), visible in the admin UI grouped by severity. This covers crawlability/indexability/on-page technical checks only — it is **not** a complete SEO assessment (no backlinks, no real ranking data).

## Generating AI opportunities

Requires crawled pages (an audit is recommended but not required — the AI call also reads `seo_issues` if present). Click **Generate AI opportunities**, or:

```bash
curl -X POST http://localhost:3000/api/websites/<website-id>/opportunities -u admin:$ADMIN_PASSWORD
```

Each surviving recommendation becomes one `seo_opportunities` row and one linked `seo_tasks` row. Every AI call is logged to `ai_jobs` (provider/model/prompt version/token usage/latency/status) regardless of success or failure.

## Seed data

```bash
npm run seed
```

Creates the "CV Central" organization and website (idempotent — safe to re-run). Then follow the crawl → audit → opportunities steps above, in order.

## Manual job sweep (fallback worker)

The fire-and-forget trigger relies on the Node process staying alive after the HTTP response (true for `next dev`/`next start`; not guaranteed on serverless). As a fallback:

```bash
npm run jobs:sweep          # one-off CLI sweep of PENDING jobs
curl -X POST http://localhost:3000/api/jobs/process -u admin:$ADMIN_PASSWORD   # same, over HTTP
```

Point a real scheduler at the HTTP endpoint later instead of building a queue now — which is exactly what Phase 2A's scheduler does, see below.

## Scheduler (Phase 2A)

`runScheduledSweep()` (`lib/jobs/scheduler.ts`) does, every time it's called — safe to call on any cadence, including twice in a row:

1. **Recover stale jobs** — any `PROCESSING` job whose `started_at` is older than 15 minutes (`STALE_PROCESSING_THRESHOLD_MS` in `lib/jobs/policy.ts`) is treated as failed and flows into step 2.
2. **Requeue retry-eligible failures** — a `FAILED` job with `retry_count < max_retries` (default 3, so 3 total attempts) whose `completed_at` is more than 5 minutes ago (`RETRY_COOLDOWN_MS`) goes back to `PENDING`. A job at `max_retries` is left permanently `FAILED` — no endless retries.
3. **Enqueue due jobs** — for each `status='active'` website whose relevant `next_*_at` has passed (or is `null`), create the corresponding job, skipping any website that already has one `PENDING`/`PROCESSING` (the existing idempotency-key index handles this): `CRAWL_WEBSITE`, `KEYWORD_DISCOVERY` (Phase 2B), and `SEARCH_CONSOLE_SYNC` (Phase 2C, scoped to only websites with an `active` `search_console_connections` row).
4. **Drain the queue** — runs the bounded worker loop (up to 4 minutes / 30 iterations, `lib/jobs/policy.ts`), re-querying between jobs so a job chained mid-sweep gets processed in the same invocation when there's time left. Chaining now includes `SEARCH_CONSOLE_SYNC → ANALYSE_SEARCH_PERFORMANCE` (Phase 2D, `getNextJobType`) alongside the existing `CRAWL_WEBSITE → RUN_SEO_AUDIT → GENERATE_SEO_OPPORTUNITIES` chain — a completed sync automatically triggers analysis, same mechanism, no new scheduler phase needed.
5. **Record the run** — one `scheduler_runs` row with counts, visible at `/admin/automation`.

### Running it

- **Locally**: `npm run scheduler:run`, or the admin UI's **Run scheduler now** button at `/admin/automation`, or:
  ```bash
  curl -X POST http://localhost:3000/api/scheduler/run -H "Authorization: Bearer $CRON_SECRET"
  ```
- **On a schedule**: `.github/workflows/scheduler.yml` runs daily (`0 3 * * *`, plus manual `workflow_dispatch`) and calls the deployed endpoint. It needs two **GitHub Actions secrets** (repo Settings → Secrets and variables → Actions) — never committed:
  - `SCHEDULER_URL` — e.g. `https://your-deployment.example.com/api/scheduler/run`
  - `CRON_SECRET` — must match the `CRON_SECRET` env var on that deployment
- **On Vercel** (if deployed there later): `/api/scheduler/run` needs no code changes — Vercel Cron sends `Authorization: Bearer $CRON_SECRET` natively, matching this endpoint's auth check exactly. Add a `vercel.json` cron entry pointing at the path.

### API authorization

Fixed in Phase 2D: `proxy.ts`'s Basic Auth now covers `/api/**` too (previously `/admin/:path*` only — every API route was reachable with zero credentials). `/api/scheduler/run` (bearer-secret) and the OAuth callback (signed state param) are the two documented exceptions, since neither can carry Basic Auth. This is a single shared *operator* credential, not real multi-tenant isolation — see `SECURITY_AUDIT.md` for the full route inventory and what's honestly still deferred until a real client-auth system exists.

## Keyword Intelligence (Phase 2B)

Adds keyword storage, existing-page matching, and opportunity scoring per website, feeding high-value results into the *existing* `seo_opportunities`/`seo_tasks` system rather than a parallel one — and runs on its own recurring schedule via the Phase 2A scheduler.

### Architecture

- **`KeywordDataProvider`** (`lib/keywords/provider.ts`): `getKeywordMetrics()`, `getKeywordSuggestions()`, `getRelatedKeywords()`. The only implementation today, `NullKeywordProvider` (`lib/keywords/null-provider.ts`), returns **empty results** — no real keyword-data API is configured, and the platform's rule is that search volume/CPC/competition are either real provider data or absent entirely, never invented. `lib/keywords/get-provider.ts` is the factory seam, mirroring `lib/ai/get-provider.ts`.
- **Keyword candidates** still have to come from somewhere with no real provider wired up: `lib/ai/prompts/keyword-discovery.ts` + a schema in `lib/ai/schemas.ts` ask the AI provider to propose phrases from the site's own crawled page inventory (titles/H1/meta/URLs, never raw HTML) — the schema has no field for volume/CPC/competition, so the model structurally cannot persist invented metrics, same trick as Phase 1's opportunity schema. Every keyword's `source` column records where it came from.
- **Matching** (`lib/keywords/matching.ts`) is weighted lexical overlap (title 40% / H1 25% / heading 15% / URL 10% / meta 10%) against crawled pages, optionally corroborated by the AI's own holistic judgement (`match_type: 'ai_semantic'`). This is **not** embeddings/semantic search — explicitly labeled as such in code comments and the admin UI.
- **Opportunity scoring** (`lib/keywords/scoring.ts`, `computeKeywordOpportunityScore()`) — a documented, configurable weighted formula:
  ```
  score = businessRelevance × 1.5 + commercialValue × 1.3 + coverageGap × 1.2 − difficulty × 1.0
  ```
  where `coverageGap` (1-5) is derived from how well an existing page already covers the keyword (no match = max gap). All weights are named exported constants. This is an **internal prioritisation score**, not a ranking prediction — labeled as such everywhere it's shown.
- **Promotion**: only `keyword_opportunities` scoring ≥ `PROMOTION_THRESHOLD` (`lib/keywords/limits.ts`, default 8) become a real `seo_opportunities` row (+ `opportunity_keywords` link, reusing `linkOpportunityKeyword`) + `seo_tasks` row (reusing `insertTask`) — not every keyword becomes a task. A `seo_opportunity_id` back-reference makes promotion idempotent; re-running discovery never creates duplicate tasks for the same keyword.
- **Provider failure handling**: the AI call is a hard failure (logged to `ai_jobs`, rethrown, flows into Phase 2A's existing retry policy for free). The `KeywordDataProvider` call is a soft failure — wrapped separately, logged, discovery proceeds AI-only. `lib/keywords/merge.ts`'s `mergeKeywordCandidates()` is the pure function that makes this testable without mocking a DB.

### Configuring a real keyword provider

1. Implement `KeywordDataProvider` in a new file (e.g. `lib/keywords/dataforseo-provider.ts`), calling the real API and mapping its response onto `KeywordMetricsResult`/`KeywordSuggestion` — never inventing a field the API didn't return.
2. Wire it into `lib/keywords/get-provider.ts` (same pattern as `lib/ai/get-provider.ts`'s `AI_PROVIDER` switch).
3. Nothing else changes — `lib/jobs/handlers/keyword-discovery.ts` only depends on the `KeywordDataProvider` interface.

### Testing keyword discovery

Via the admin UI: open a website's Keyword Intelligence page (`/admin/websites/[id]/keywords`) and click **Run Keyword Discovery**. Via the API:

```bash
curl -X POST http://localhost:3000/api/websites/<website-id>/keyword-discovery -u admin:$ADMIN_PASSWORD
```

Requires a completed crawl first (it reads the crawled page inventory). Results — keywords, page matches, opportunities, and any promoted tasks — appear on the same Keyword Intelligence page, filterable by intent/action/status/source, each row labeled with its data source ("AI recommendation" vs "Provider data" vs "Manual entry"). Verified live against CV Central: 5-10 realistic, business-grounded keywords per run (e.g. *"landlord accountant"*-style specificity — in CV Central's case, things like *"CV application tracking tools"*, *"AI-powered CV builder UK"*), correctly matched to existing pages, correctly promoted to real `seo_tasks`, zero duplicates across repeated runs (including through a real transient network failure during testing, which the idempotency mechanism absorbed correctly).

## Search Console integration (Phase 2C)

Per-website Google OAuth connection — each client authorizes read-only access to their own Search Console property, not one shared static credential — that syncs real clicks/impressions/CTR/position on its own recurring schedule. This is the platform's first genuinely external/measured data source; everything before it was crawled, AI-derived, or provider-estimated.

### Architecture

- **OAuth** (`lib/search-console/oauth.ts`): hand-rolled `fetch` calls to Google's OAuth endpoints (`access_type=offline` + `prompt=consent`, so a refresh token is always returned, even on reconnect) — no `googleapis` dependency, same philosophy as the crawler.
- **CSRF-safe callback** (`lib/search-console/state.ts`): the OAuth callback (`app/api/auth/google-search-console/callback/route.ts`) is necessarily reachable without Basic Auth — Google's redirect can't carry it. It's protected instead by a signed, expiring `state` param (HMAC via `node:crypto`, keyed by `GOOGLE_OAUTH_CLIENT_SECRET`, so no extra secret is needed): without that secret, an attacker cannot forge a state binding to an arbitrary `website_id`.
- **Site selection**: a Google account can have several verified GSC properties, so the connection starts in `status='pending_site_selection'` after the OAuth callback; the admin picks one on `/admin/websites/[id]/search-console` (`lib/search-console/client.ts`'s `listSites()`) before syncing begins.
- **Sync** (`lib/jobs/handlers/search-console-sync.ts`): refreshes the access token if it's expired/near-expiry, pulls the last `SYNC_LOOKBACK_DAYS` (7) days dimensioned by `[date, query, page]`, capped at `MAX_ROWS_PER_SYNC` (500) — named constants in `lib/search-console/limits.ts`. Rows are upserted (`unique(website_id, date, query, page_url)`), so re-syncing an overlapping window never duplicates data and self-heals if Google backfills/revises recent rows.
- **Honesty**: `search_console_metrics` only ever holds what Google's API actually returned — `lib/search-console/normalize.ts` is a pure mapper with no fabricated fields, and the admin UI labels this data "Actual Google Search Console data" to distinguish it from AI-derived opportunities and provider-estimated keyword metrics.
- **Known simplification, flagged**: `refresh_token`/`access_token` are stored as plaintext columns (service-role-only access, same trust model already used for `SUPABASE_SERVICE_ROLE_KEY`/AI provider keys). Field-level encryption is worth adding later; not blocking for this phase.

### Setting up Google OAuth credentials

1. In [Google Cloud Console](https://console.cloud.google.com/), create/select a project and enable the **Google Search Console API**.
2. Configure the OAuth consent screen (External is fine; Testing mode is fine) with scope `https://www.googleapis.com/auth/webmasters.readonly`.
3. Create an **OAuth 2.0 Client ID** (Web application) with authorized redirect URI `http://localhost:3000/api/auth/google-search-console/callback` (adjust the host for a real deployment).
4. Add `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET` to `.env.local`.
5. The Google account used to connect needs access to the target GSC property (verified in Search Console itself).

### Testing the integration

Via the admin UI: open a website's Search Console page (`/admin/websites/[id]/search-console`) and click **Connect Search Console** — this redirects to Google, then back to the site-picker, then shows stats/metrics once a property is selected. **Sync now** triggers a manual `SEARCH_CONSOLE_SYNC` job (mirrors the keyword-discovery manual-trigger pattern):

```bash
curl -X POST http://localhost:3000/api/websites/<website-id>/search-console-sync -u admin:$ADMIN_PASSWORD
```

Re-run a sync twice to confirm the unique constraint prevents duplicate rows.

## SEO Decision Engine (Phase 2D)

Combines crawled pages, keyword intelligence, and real Search Console data into deterministic, explainable SEO opportunities — the first phase that reasons *across* the platform's data sources instead of adding a new one. Runs as its own job type, `ANALYSE_SEARCH_PERFORMANCE`, chained automatically after a completed `SEARCH_CONSOLE_SYNC` and also manually triggerable (useful for websites with no Search Console connection yet — the two detectors that don't need one still run).

### Principle: TypeScript calculates, AI interprets

Every number a `search_performance_opportunities` row is built from — position, impressions, clicks, CTR, period-over-period deltas, the opportunity score itself — is computed in `lib/search-performance/*`, pure TypeScript, unit-tested without touching the AI provider at all. The optional AI pass that follows (`lib/ai/prompts/search-performance.ts` + `searchPerformanceInterpretationSchema` in `lib/ai/schemas.ts`) has **no numeric field anywhere** — it explains significance and suggests direction, and structurally cannot recompute or invent a number, same trick as every other AI schema in this codebase. A failed or skipped AI call never blocks detection or promotion; `ai_rationale` just stays null until (and unless) a later run fills it in.

### The 7 detectors (`lib/search-performance/detectors/*`)

| Detector | Signal | Recommended action |
|---|---|---|
| `PAGE_TWO_OPPORTUNITY` | Real position 11-20, meaningful impressions, an existing relevant page already covers it | `OPTIMISE_EXISTING_PAGE` |
| `HIGH_IMPRESSIONS_LOW_CTR` | Actual CTR falls well short of an internal expected-CTR-by-position benchmark (`lib/search-performance/expected-ctr.ts` — a documented internal heuristic, **not** a disclosed Google ranking factor) | `IMPROVE_CTR` |
| `MISSING_PAGE` | A keyword with *demand evidence* (real provider search volume OR meaningful actual GSC impressions) and no adequately-relevant existing page | `CREATE_NEW_PAGE` |
| `DECLINING_KEYWORD` | Meaningful drop in clicks/impressions/position vs the previous comparison period, above a minimum baseline (avoids noise from tiny samples) | `INVESTIGATE_DECLINE` |
| `EMERGING_KEYWORD` | A genuinely new query or a substantial impressions increase vs the previous period | `INVESTIGATE_OPPORTUNITY` (never auto-promoted to a task — surfaced for a human look only) |
| `CONTENT_GAP` | Re-surfaces existing Phase 2B `keyword_opportunities` rows (AI-judged relevance, no measured demand required) that have no matching page and aren't yet promoted — zero duplicate AI calls | `CREATE_NEW_PAGE` |
| `INTERNAL_LINK_OPPORTUNITY` | A page topically relevant to a keyword (Phase 2B's lexical matcher) that doesn't yet link to the page that best covers it | `IMPROVE_INTERNAL_LINKING` |

### Historical comparison

`lib/search-performance/comparison.ts` aggregates raw `search_console_metrics` rows (fetched via `listSearchConsoleMetricsForWebsiteInRange`) by normalized query and diffs two periods — current vs previous, 7-vs-7 days by default (`DEFAULT_COMPARISON_WINDOW_DAYS`), opportunistically 28-vs-28 once a connection has synced enough history (`EXTENDED_COMPARISON_WINDOW_DAYS`). No data is duplicated — this reads `search_console_metrics`, it doesn't write a second copy of it.

### Keyword matching

GSC `query` strings are matched to tracked `keywords` rows via `normalizeKeyword()` (Phase 2B, reused as-is — case/whitespace-insensitive), so *"landlord accountant Coventry"* from a keyword provider and *"landlord accountant coventry"* from Search Console are recognised as the same keyword. Measured GSC performance is attached to the opportunity's `signals` snapshot; it never overwrites `keyword_metrics` (real provider data) — each source stays explicit, both in the schema and in the admin UI.

### Scoring

`lib/search-performance/scoring.ts`, documented formula:

```
score = businessRelevance × 1.5 + commercialValue × 1.3 + opportunityMagnitude × 1.4 + trafficSignal × 1.0 − effort × 0.8
```

All five inputs are 1-5, floored at 0 overall. `businessRelevance`/`commercialValue` come from a matched Phase 2B `keyword_opportunities` row when one exists (default 3/neutral otherwise — never a fresh AI call just to score). `opportunityMagnitude`/`trafficSignal` are detector-specific deterministic derivations (position gap, CTR gap, decline severity, growth magnitude, coverage gap, link relevance). `effort` is a fixed constant per recommended action (`EFFORT_BY_ACTION`), not invented per-opportunity. **This is an internal prioritisation score, not a Google ranking formula or a ranking prediction** — labeled as such everywhere it's shown, same convention as Phase 2B's keyword score.

### Idempotency

A deterministic `dedupe_key` (`lib/search-performance/dedupe-key.ts`) — `detectorType:keywordId:pageId:relatedPageId` — rather than a multi-column unique constraint, because identity varies by detector and Postgres treats `NULL` columns as distinct from each other. Re-running analysis upserts existing rows (fresh signals/score) instead of duplicating them. Promotion into `seo_opportunities`/`seo_tasks` follows the same `seo_opportunity_id`-back-reference pattern Phase 2B established — only `CREATE_NEW_PAGE` / `OPTIMISE_EXISTING_PAGE` / `IMPROVE_CTR` / `INVESTIGATE_DECLINE` / `IMPROVE_INTERNAL_LINKING` opportunities at or above `PROMOTION_THRESHOLD` (`lib/search-performance/limits.ts`, default 8) ever become a task; `INVESTIGATE_OPPORTUNITY` (emerging keywords) is deliberately never auto-tasked. Promotions are additionally capped at `MAX_PROMOTIONS_PER_RUN` (15) per run, highest-scored first — found necessary during live testing: `IMPROVE_INTERNAL_LINKING`'s low fixed effort (1) clears the threshold easily, and an unbounded run against a keyword-rich site could otherwise promote dozens of tasks at once. Anything past the cap is still stored/scored and gets picked up on a later run.

### Testing the SEO Decision Engine

Via the admin UI: open a website's SEO Decision Engine page (`/admin/websites/[id]/search-performance`) and click **Run analysis**. Via the API:

```bash
curl -X POST http://localhost:3000/api/websites/<website-id>/search-performance-analysis -u admin:$ADMIN_PASSWORD
```

Best results after a crawl + keyword discovery + at least one Search Console sync (the GSC-dependent detectors need synced data; `CONTENT_GAP`/`INTERNAL_LINK_OPPORTUNITY` work from crawl/keyword data alone). Results appear on the same page, filterable by type/action/status/score, each row showing its measured signals, deterministic reasoning, and (once analysed) AI rationale. Re-run analysis twice to confirm no duplicate opportunities or tasks.

## What remains for Phase 2E+

- A real `KeywordDataProvider` implementation (search volume/CPC/competition/difficulty) — the abstraction and schema are ready to receive one; see "Configuring a real keyword provider" above.
- Feeding real Search Console position/clicks into `keyword_opportunities.difficulty_score`, replacing the AI-estimated placeholder now that real ranking data exists.
- Splitting `ANALYSE_WEBSITE` into its own richer step once real keyword data exists.
- A real worker/queue (BullMQ+Redis or similar) behind the same `jobs` table — `lib/jobs/handlers/*` only depend on the `JobHandler` signature, so this replaces `processPendingJobs`'s loop without touching them.
- Real per-tenant authorization — `/api/**` now requires the shared operator `ADMIN_PASSWORD`, but there's still no per-client isolation (see `SECURITY_AUDIT.md`'s "Deferred" section) until Supabase Auth sessions + `memberships`-scoped access replace the service-role-key-everywhere model.
- Ranking history, backlink intelligence, competitor scraping.
- Content briefs, automatic content generation/publishing, client-facing reports, billing — all explicitly out of scope so far.
