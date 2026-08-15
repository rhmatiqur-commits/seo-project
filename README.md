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

```
app/
  admin/            internal admin UI (server components + server actions)
    automation/      job stats, scheduler runs, per-website schedule, manual controls
    websites/[id]/keywords/  Keyword Intelligence: stats, filters, run-discovery button
  api/               JSON API route handlers
    scheduler/run/    CRON_SECRET-gated scheduled sweep entrypoint
    websites/[id]/keyword-discovery/  manual KEYWORD_DISCOVERY trigger
lib/
  supabase/          server-side client + generated Database types
  crawler/            crawl engine
  audit/               technical SEO rules + engine
  ai/                    provider abstraction, schemas, prompts, analysis service
  jobs/                 job runner, scheduler, pure policy/decision functions, per-job-type handlers
  keywords/              keyword provider abstraction + pure normalize/match/score/merge modules
  db/                    typed query helpers, one file per entity
supabase/migrations/  versioned SQL (source of truth; applied via Supabase MCP)
scripts/               seed.ts, run-pending-jobs.ts, run-scheduler.ts
```

## Database schema

19 tables, UUID primary keys, `created_at`/`updated_at` timestamps, RLS enabled everywhere. See `supabase/migrations/` (`0001_init.sql` through `0006_keyword_intelligence.sql`) for the full source of truth.

- **organizations**, **memberships** (user↔org, role) — core multi-tenancy.
- **websites** — per-org, with crawl limits (`crawl_max_pages`, `crawl_max_depth`), last-known robots.txt/sitemap availability, and two **independent** recurring schedules: `next_crawl_at`/`crawl_frequency_days` (default 7 — weekly) and `next_keyword_discovery_at`/`keyword_discovery_frequency_days` (default 30 — monthly, Phase 2B). `status='active'` doubles as the "eligible for scheduling" flag for both; `paused`/`archived` websites are skipped.
- **jobs** — generic async job queue (`job_type`, `status`, `priority`, `retry_count`/`max_retries`, `payload`, `result`, timestamps). A partial unique index on `idempotency_key` (scoped to `PENDING`/`PROCESSING` only — see migration `0003`) is the mechanism that prevents duplicate concurrent jobs of the same type for the same website, reused as-is by every schedule.
- **scheduler_runs** — one row per sweep (Phase 2A): counts of websites checked, crawl jobs created, jobs processed/completed/failed/retried, stale-recovered, timestamps, error (keyword-discovery counts live in the `summary` jsonb column). Platform-internal (not tenant data) — RLS enabled with no policies, service-role only.
- **website_pages** — one row per crawled URL: status, title, meta description, H1, headings (jsonb), word count, canonical, noindex, structured-data types, image/link counts, orphan flag, redirect chain (jsonb).
- **page_links** — the internal/external link graph between crawled pages.
- **seo_audits** / **seo_issues** — one audit run → many issues, each with severity/category/recommended action.
- **keywords** — per-org/website, unique on `(website_id, keyword, country, language)`. `source` distinguishes `'ai_suggested'` / `'provider'` / `'manual'`; `search_intent` is one of the 6 Phase 2B categories (`INFORMATIONAL`/`COMMERCIAL`/`TRANSACTIONAL`/`NAVIGATIONAL`/`LOCAL`/`UNKNOWN`).
- **keyword_metrics** (Phase 2B) — real provider data only (search volume/competition/CPC + `metric_source`). An absent row means "no data collected," never a row of fabricated numbers.
- **keyword_page_matches** (Phase 2B) — a keyword's best-matching existing page, `match_type` (title/h1/heading/url/meta_description/ai_semantic/none) + `relevance_score`.
- **keyword_opportunities** (Phase 2B) — one row per (website, keyword): AI-derived 1-5 scores, computed `opportunity_score`, `recommended_action`, `reasoning`, and a `seo_opportunity_id` back-reference once promoted into the task system (null until then).
- **competitors** — manual entry only; no scraping.
- **seo_opportunities** — recommendations (`CREATE_NEW_PAGE` / `OPTIMISE_EXISTING_PAGE` / `TECHNICAL_FIX` / `INTERNAL_LINKING` / `RESEARCH_REQUIRED`), with `priority_score` + `priority_components` and an `ai_job_id` back-reference. Populated both by Phase 1's page-level AI analysis and by Phase 2B's keyword-opportunity promotion — one system, two feeders.
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

## Local development

```bash
npm install
npm run dev       # http://localhost:3000 (admin at /admin, prompts for ADMIN_PASSWORD via Basic Auth)
npm run typecheck
npm test           # pure-function unit tests: audit rules, job scheduling policy, keyword modules (node:test)
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
3. **Enqueue due crawls** — for each `status='active'` website whose `next_crawl_at` has passed (or is `null`, i.e. never crawled), create a `CRAWL_WEBSITE` job, skipping any website that already has one `PENDING`/`PROCESSING` (the existing idempotency-key index handles this).
4. **Drain the queue** — runs the bounded worker loop (up to 4 minutes / 30 iterations, `lib/jobs/policy.ts`), re-querying between jobs so a job chained mid-sweep (e.g. the audit created right after a crawl completes) gets processed in the same invocation when there's time left.
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

### Known gap (flagged, not fixed in this phase)

All existing `/api/**` routes besides `/api/scheduler/run` are unauthenticated — `proxy.ts`'s Basic Auth only matches `/admin/:path*`. This predates Phase 2A; worth hardening in a follow-up (e.g. widening the proxy matcher, or adding the same bearer-secret pattern to the other trigger routes).

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

## What remains for Phase 2C+

- A real `KeywordDataProvider` implementation (search volume/CPC/competition/difficulty) — the abstraction and schema are ready to receive one; see "Configuring a real keyword provider" above.
- Splitting `ANALYSE_WEBSITE` into its own richer step once real keyword data exists.
- A real worker/queue (BullMQ+Redis or similar) behind the same `jobs` table — `lib/jobs/handlers/*` only depend on the `JobHandler` signature, so this replaces `processPendingJobs`'s loop without touching them.
- Securing the remaining unauthenticated `/api/**` trigger routes (see "Known gap" above).
- Google Search Console integration, ranking history, backlink intelligence, competitor scraping.
- Client-facing auth (Supabase Auth sessions using the `memberships`/RLS already in place) instead of the shared `ADMIN_PASSWORD`.
- Content briefs, automatic content generation/publishing, client-facing reports, billing — all explicitly out of scope so far.
