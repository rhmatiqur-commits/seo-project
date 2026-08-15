# AI SEO Automation Platform — Phase 1

A multi-tenant foundation for a productised AI SEO service. Phase 1 delivers one working, end-to-end pipeline:

```
CLIENT → WEBSITE → CRAWL WEBSITE → STORE WEBSITE DATA → ANALYSE WEBSITE → IDENTIFY SEO OPPORTUNITIES → CREATE SEO TASKS
```

CV Central is the first test client, but nothing in the code is CV-Central-specific — it's seeded through the same `createOrganization`/`createWebsite` calls any client onboarding would use.

## Architecture

- **Framework**: Next.js 16 (App Router) + TypeScript. One app serves both the JSON API (`app/api/**`, Route Handlers) and a deliberately plain internal admin UI (`app/admin/**`, server components + server actions — no client-side framework, no design investment).
- **Database/auth**: Supabase (Postgres + Auth + RLS). The Next.js server talks to Supabase with the **service-role key** (`lib/supabase/server.ts`) — it's a trusted backend, so Phase 1 doesn't route through RLS. The schema and RLS policies are written now so Phase 2 can expose data straight to logged-in client users later without a schema change.
- **Crawler**: `lib/crawler/*` — built-in `fetch` + `cheerio` for HTML parsing + `robots-parser` for robots.txt. No headless browser (no JS rendering) — a known Phase 1 limitation.
- **SEO audit**: `lib/audit/*` — a set of small, pure rule functions (`lib/audit/rules/*.ts`) run over crawled pages/links by `lib/audit/engine.ts`.
- **AI**: `lib/ai/provider.ts` defines an `AIProvider` interface (`generateStructuredOutput`, `generateText`, `analyse`); `lib/ai/anthropic-provider.ts` is the only implementation today, using Claude's tool-use for structured output. `lib/ai/seo-analysis.ts` is the orchestration: build a compact structured summary from the DB → call the provider → validate with zod → dedupe → persist opportunities + tasks.
- **Jobs**: `lib/jobs/*` — a `jobs` table + an in-process runner (`processJob`/`processPendingJobs`), no Redis/queue yet. `lib/jobs/trigger.ts` is the fire-and-forget seam API routes and admin actions call.
- **Scheduler**: none yet — every job is manually triggered (button in the admin UI, or a POST to the API). `/api/jobs/process` and `scripts/run-pending-jobs.ts` are the seam a real cron/worker would call later.

```
app/
  admin/            internal admin UI (server components + server actions)
  api/               JSON API route handlers
lib/
  supabase/          server-side client + generated Database types
  crawler/            crawl engine
  audit/               technical SEO rules + engine
  ai/                    provider abstraction, schemas, prompts, analysis service
  jobs/                 job runner + per-job-type handlers
  db/                    typed query helpers, one file per entity
supabase/migrations/  versioned SQL (source of truth; applied via Supabase MCP)
scripts/               seed.ts, run-pending-jobs.ts
```

## Database schema

14 tables, UUID primary keys, `created_at`/`updated_at` timestamps, RLS enabled everywhere. See [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) for the full source of truth.

- **organizations**, **memberships** (user↔org, role) — core multi-tenancy.
- **websites** — per-org, with crawl limits (`crawl_max_pages`, `crawl_max_depth`) and last-known robots.txt/sitemap availability.
- **jobs** — generic async job queue (`job_type`, `status`, `priority`, `retry_count`, `payload`, `result`, timestamps).
- **website_pages** — one row per crawled URL: status, title, meta description, H1, headings (jsonb), word count, canonical, noindex, structured-data types, image/link counts, orphan flag, redirect chain (jsonb).
- **page_links** — the internal/external link graph between crawled pages.
- **seo_audits** / **seo_issues** — one audit run → many issues, each with severity/category/recommended action.
- **keywords**, **competitors** — manual or AI-suggested only; no scraping.
- **seo_opportunities** — AI recommendations (`CREATE_NEW_PAGE` / `OPTIMISE_EXISTING_PAGE` / `TECHNICAL_FIX` / `INTERNAL_LINKING` / `RESEARCH_REQUIRED`), with `priority_score` + `priority_components` and an `ai_job_id` back-reference.
- **opportunity_keywords** — join table.
- **seo_tasks** — one task per stored opportunity (also usable standalone later), with its own status lifecycle.
- **ai_jobs** — one row per individual AI provider call: provider, model, prompt version, token usage, latency, status, result. Distinct from `jobs` — a single `ANALYSE_WEBSITE`/`GENERATE_SEO_OPPORTUNITIES` job makes exactly one AI call today, but the schema allows more later without migration.

RLS: every tenant table is scoped via an `is_org_member(organization_id)` helper function checked against `memberships`. The service-role key bypasses this by design (Phase 1); it exists for Phase 2 client-facing access.

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

## Local development

```bash
npm install
npm run dev       # http://localhost:3000 (admin at /admin, prompts for ADMIN_PASSWORD via Basic Auth)
npm run typecheck
npm test           # audit rule unit tests (node:test)
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

Point a real scheduler at the HTTP endpoint later instead of building a queue now.

## What remains for Phase 2

- Real keyword-data provider (search volume, difficulty) — explicitly not built here; `keywords.intent`/`source` are ready to receive it.
- Splitting `ANALYSE_WEBSITE` into its own richer step once keyword data exists.
- A real worker/queue (BullMQ+Redis or similar) behind the same `jobs` table, replacing the fire-and-forget + manual-sweep approach.
- Real scheduled jobs (daily Search Console sync, weekly crawl, weekly opportunity analysis, monthly reporting) — the `jobs` table and manual triggers are the seam; add a cron caller.
- Search Console integration, ranking history, backlink/competitor data.
- Client-facing auth (Supabase Auth sessions using the `memberships`/RLS already in place) instead of the shared `ADMIN_PASSWORD`.
- Content briefs, content generation/publishing, client-facing reports, billing — all explicitly out of scope for Phase 1.
