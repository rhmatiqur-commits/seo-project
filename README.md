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

**Phase 3** adds the first *external competitive* signal — real Google SERP data via DataForSEO:

```
high-priority keywords → real SERP results → classified/scored competitors → competitor page analysis → COMPETITOR_CONTENT_GAP / COMPETITOR_RANKING_GAP / SERP_FEATURE_OPPORTUNITY → seo_opportunities/seo_tasks
```

The 3 new detectors land in the *same* `search_performance_opportunities` table Phase 2D built — not a fourth, parallel opportunity system — and flow through the exact same scoring/AI-interpretation/promotion pipeline. DataForSEO sits behind a `SerpDataProvider` interface (mirroring `KeywordDataProvider`'s shape); a real `DataForSeoKeywordProvider` implementation also now fulfils the abstraction Phase 2B left ready for one.

CV Central is the first test client, but nothing in the code is CV-Central-specific — it's seeded through the same `createOrganization`/`createWebsite` calls any client onboarding would use.

**Phase 4** turns a prioritised opportunity into an actual page draft — the platform's first *execution*, not just detection, layer:

```
SEO opportunity → content brief → GENERATE_CONTENT → deterministic+AI QA → REVISE_CONTENT (bounded) → human approval
```

Everything stops at approval — "ready for Phase 5 publishing," nothing is ever published automatically. Content generation sits behind a `ContentProvider` interface (`generateContent`/`reviseContent`/`generateMetadata`), initially implemented on the platform's own existing `AIProvider` — no CV Central content-writing system is reachable from this repository or environment (checked before writing any code; see the dedicated section below), so nothing was invented there.

**Phase 5** closes the loop — APPROVED content becomes a real page on the client's own website:

```
APPROVED content → PublishingProvider → WordPress → CREATE_DRAFT (never public) → human clicks Publish → public URL → stored back for Phase 6 to measure
```

The one rule repeated throughout this phase: there is **no path** from AI-generated content to a live page without an explicit human "Publish" click, and every publish request re-verifies `content_jobs.status === 'APPROVED'` **server-side**, from the database, never from anything the browser sent. WordPress is the first `PublishingProvider` implementation, authenticated via WordPress's own Application Passwords (never the account's real login), with credentials encrypted through Supabase Vault — already installed on this project, so nothing was invented for credential storage either.

**Phase 6** closes the outer loop — the platform learns from what its own actions actually did:

```
SEO ACTION (published page / completed task) → GOOGLE → SEARCH CONSOLE → deterministic BASELINE vs CURRENT comparison → classified OUTCOME → optional AI interpretation → NEXT SEO DECISION → follow-up SEO TASK → repeat
```

`seo_actions` connects an already-existing `content_publications` row (or a completed non-content `seo_tasks` row) to a target URL/keyword; `seo_action_outcomes` holds one deterministic, TypeScript-computed row per `(action, measurement window)` — never a single-metric verdict, never a causal claim ("Position improved from 14.2 to 9.8 following publication," never "our change increased rankings by X"). AI is used only after every number is already final, to interpret *why*, never to calculate. A bounded set of outcomes (`DIAGNOSE_DECLINE`/`INVESTIGATE_CTR`) automatically creates a follow-up task through the *existing* `seo_opportunities`/`seo_tasks` system — the platform never keeps changing a page that's already succeeding, and never concludes anything from insufficient data. See the dedicated section below.

**Phase 6A** adds a second `PublishingProvider` implementation for code-based sites deployed via GitHub → Vercel — CV Central's actual deployment model, not WordPress's:

```
APPROVED content → GitHub branch → commit → pull request → Vercel preview deployment → human review → explicit MERGE_TO_PRODUCTION → Vercel production deployment → live URL
```

GitHub is the source of truth; this platform never touches Vercel's production filesystem or calls the Vercel API to publish — Vercel deploys automatically from the GitHub changes `GitHubPublishingProvider` makes, and a preview URL is detected (best-effort) straight from GitHub's own commit-status/check APIs. Nothing merges to production without an explicit, separately-audited `MERGE_TO_PRODUCTION` action — `CREATE_DRAFT` (reused, not duplicated, from Phase 5) only ever opens a pull request. A `WebsiteContentAdapter` layer keeps site-specific file/route/frontmatter knowledge out of the generic GitHub provider; CV Central's own repository was not reachable when this was built (verified the same way Phase 4 verified this for its content-generation system), so a configuration-driven generic Markdown adapter ships instead of a hard-coded one — see the dedicated section below for exactly what CV Central integration still needs. A real `CvCentralContentAdapter` was added in a follow-up, built from directly inspecting the actual `rhmatiqur-commits/cvcentral` repository (public, read-only) — see that section for what its static-HTML, no-build-step site actually looks like.

**Phase 7** turns the platform from an internal tool into a real multi-tenant SaaS — a client can log in and see only their own organisation's SEO operation:

```
Organisation → Users (OWNER/MANAGER/EDITOR/VIEWER) → Website → SEO data/Tasks/Content/Publishing/Outcomes
```

The `organizations`/`memberships` tables and every tenant table's `is_org_member(organization_id)` RLS policy already existed from Phase 1 — built then, exercised for the first time now. What Phase 7 actually adds: real Supabase Auth sessions (`/dashboard/login`, replacing nothing for `/admin`, which keeps its own separate `ADMIN_PASSWORD` gate unchanged), a richer role model, an invitation flow, and an entirely new client-facing `/dashboard/[orgSlug]/**` surface that reuses the exact same `lib/db/*`/`lib/jobs/*` services `/admin` does — never a parallel implementation. A live cross-tenant probe (a real second organisation, a real signed-in-with-the-anon-key session, 20 separate cross-tenant read attempts against a real other organisation's data) confirmed RLS blocks every one of them before any UI code was trusted — see the dedicated section below.

## Architecture

- **Framework**: Next.js 16 (App Router) + TypeScript. One app serves both the JSON API (`app/api/**`, Route Handlers) and a deliberately plain internal admin UI (`app/admin/**`, server components + server actions — no client-side framework, no design investment).
- **Database/auth**: Supabase (Postgres + Auth + RLS). `/admin/**` talks to Supabase with the **service-role key** (`lib/supabase/server.ts`'s `supabaseAdmin()`) — a trusted internal backend, so it doesn't route through RLS, same as every phase before Phase 7. `/dashboard/**` (Phase 7) is the first caller to actually use a real signed-in user's session (`lib/supabase/server-session.ts`'s `createSessionClient()`, anon key + cookies) for *authentication* and RLS *cross-tenant read verification* — its own data-fetching code still calls the same service-role `lib/db/*` functions `/admin` does, gated by an explicit app-layer membership check (`lib/auth/session.ts`) first, same trust model as `/admin`'s own `assertOwnedByOrganization`, not a second RLS-only code path. See "Multi-Tenant Client Portal" below for exactly what that means and doesn't mean.
- **Client portal auth** (Phase 7): `@supabase/ssr` for cookie-based sessions; `proxy.ts` gates `/dashboard/**` with a *separate* check from `/admin/**`'s Basic Auth — a missing/invalid Supabase session redirects to `/dashboard/login`, never falls back to or interferes with the admin password gate.
- **Crawler**: `lib/crawler/*` — built-in `fetch` + `cheerio` for HTML parsing + `robots-parser` for robots.txt. No headless browser (no JS rendering) — a known Phase 1 limitation.
- **SEO audit**: `lib/audit/*` — a set of small, pure rule functions (`lib/audit/rules/*.ts`) run over crawled pages/links by `lib/audit/engine.ts`.
- **AI**: `lib/ai/provider.ts` defines an `AIProvider` interface (`generateStructuredOutput`, `generateText`, `analyse`); `lib/ai/anthropic-provider.ts` is the only implementation today, using Claude's tool-use for structured output. `lib/ai/seo-analysis.ts` is the orchestration: build a compact structured summary from the DB → call the provider → validate with zod → dedupe → persist opportunities + tasks.
- **Jobs**: `lib/jobs/*` — a `jobs` table + an in-process runner, no Redis/queue yet. `lib/jobs/trigger.ts` (fire-and-forget) is still what manual admin/API triggers use; `processPendingJobs` (`lib/jobs/runner.ts`) is a bounded worker loop that explicitly drains the queue rather than relying on a detached promise — used by the scheduler, `/api/jobs/process`, and `npm run jobs:sweep`. `processJob` enqueues the next pipeline stage on `COMPLETED` (`lib/jobs/policy.ts` has the pure due/stale/retry/next-stage decision logic, unit-tested in `policy.test.ts`). `processJob` atomically **claims** a job (`lib/db/jobs.ts`'s `claimJob`, a conditional `UPDATE ... WHERE status = 'PENDING'`) before running its handler — found necessary during Phase 4 live testing, where `triggerJob`'s fire-and-forget call racing a subsequent `processPendingJobs()` sweep on the same job id caused `GENERATE_CONTENT` to run its handler twice concurrently, producing a duplicate, never-QA'd content version. Fixed for every job type, not just content ones.
- **Scheduler**: `lib/jobs/scheduler.ts`'s `runScheduledSweep()` — recovers stale jobs, requeues retry-eligible failures, enqueues `CRAWL_WEBSITE` and `KEYWORD_DISCOVERY` for due active websites (independent schedules), runs the worker loop, records a `scheduler_runs` row. Exposed at `POST/GET /api/scheduler/run` (bearer-secret gated) and called on a cron by `.github/workflows/scheduler.yml`. Designed so a real queue (BullMQ/Redis) could later replace the worker loop without touching `lib/jobs/handlers/*` — handlers only depend on the `JobHandler` signature, never on how they're invoked.
- **Keyword Intelligence** (Phase 2B): `lib/keywords/*` — pure modules (normalize/match/score/merge) plus a `KeywordDataProvider` abstraction (`lib/keywords/provider.ts`), mirroring `AIProvider`'s shape exactly. `lib/jobs/handlers/keyword-discovery.ts` orchestrates it all and reuses Phase 1's `insertOpportunity`/`insertTask`/`linkOpportunityKeyword` to promote high-value keyword opportunities into the existing task system. See the dedicated section below.
- **Search Console integration** (Phase 2C): `lib/search-console/*` — hand-rolled `fetch` wrappers around Google's OAuth and Search Console (Webmasters v3) REST endpoints (no `googleapis` dependency), a signed/expiring OAuth `state` param for the unauthenticated callback route, and a pure row-normalizer. `lib/jobs/handlers/search-console-sync.ts` refreshes the access token when needed and upserts real metrics. See the dedicated section below.
- **SEO Decision Engine** (Phase 2D): `lib/search-performance/*` — 7 pure detector modules, a historical-comparison aggregator, a documented scoring formula, and a deterministic dedupe-key builder for idempotent upserts. `lib/jobs/handlers/analyse-search-performance.ts` orchestrates detection → scoring → an optional bounded AI-interpretation pass → promotion into `seo_opportunities`/`seo_tasks`. See the dedicated section below.
- **API authorization** (Phase 2D): `proxy.ts`'s Basic Auth now also covers `/api/**` (previously `/admin/**` only); `lib/api/authorize.ts` guards against a client-supplied organization id being trusted over the resource's real owner. See `SECURITY_AUDIT.md` for the full audit and its honestly-documented limits.
- **Competitor & SERP Intelligence** (Phase 3): `lib/dataforseo/client.ts` — one shared Basic-Auth HTTP client used by both `lib/serp/dataforseo-serp-provider.ts` (`SerpDataProvider`) and `lib/keywords/dataforseo-provider.ts` (`KeywordDataProvider`). `lib/serp/*` holds deterministic classification/scoring/aggregation/overlap modules; 3 new detectors reuse Phase 2D's exact pipeline (`lib/jobs/handlers/search-performance-shared.ts`, extracted from `analyse-search-performance.ts` in this phase so both jobs share one code path). See the dedicated section below.
- **Content Execution Engine** (Phase 4): `lib/content/*` — a `ContentProvider` interface (`provider.ts`/`get-provider.ts`, mirrors `AIProvider`'s shape) with an `AiContentProvider` implementation; a pure `buildContentBrief()` assembling a structured brief from already-collected Phase 1-3 data (`build-brief.ts`); a deterministic+AI QA system (`qa/*` — ~13 pure checks, one soft-failing AI rating call, a pure score/pass combiner); a pure approval state-machine (`state-machine.ts`). Three new job types (`GENERATE_CONTENT`/`QA_CONTENT`/`REVISE_CONTENT`, `lib/jobs/handlers/*-content.ts`) self-chain scoped by `content_job_id` rather than the generic website-scoped pipeline mechanism, since many content briefs can be in flight per website at once. See the dedicated section below.
- **Publishing Engine** (Phase 5): `lib/publishing/*` — a `PublishingProvider` interface (`provider.ts`/`get-provider.ts`, a per-call factory since credentials are per-website, not a process-wide singleton) with a `WordPressPublishingProvider` implementation (hand-rolled `fetch` against the official WP REST API, no scraping); pure `retry-strategy.ts` (the "before retrying, check whether the page already exists" decision), `errors.ts` (permanent-vs-retryable classification), `url.ts` (never let an AI recommendation silently rename an existing page), `markdown.ts` (body Markdown → the HTML WordPress's REST API expects). Credentials are encrypted via **Supabase Vault** (`vault` schema + `pgsodium`, already installed on this project) through 4 `SECURITY DEFINER` wrapper functions (migration `0018`), never a plaintext column. Two new job types (`CREATE_DRAFT`/`PUBLISH_CONTENT`) self-chain scoped by `content_publication_id`, same reasoning as Phase 4's content jobs. A new generic job-engine primitive, `PermanentJobError` (`lib/jobs/types.ts`), lets any handler mark a failure as never-retryable (content not APPROVED, bad credentials, ...) — `lib/jobs/runner.ts` jumps `retry_count` straight to `max_retries` when it catches one. See the dedicated section below.
- **Autonomous SEO Optimisation Loop** (Phase 6): `lib/outcomes/*` — pure, unit-tested modules only (baseline/measurement-window date math, metric aggregation, delta computation, minimum-data gating, outcome classification, next-action recommendation, new-page lifecycle staging, alert-threshold evaluation, autonomy-level policy, follow-up-task decision) — zero DB/AI dependency, same "TypeScript calculates, AI interprets" principle as Phase 2D. `lib/jobs/handlers/analyse-action-outcomes.ts` is the composition layer: one new job type, `ANALYSE_ACTION_OUTCOMES`, its own independent per-website schedule. `lib/jobs/handlers/record-seo-action.ts` is where a `seo_actions` row is actually created — hooked into `publish-content.ts` (on `PUBLISHED`) and `app/admin/actions.ts`'s `updateTaskStatusAction` (on a non-content task marked `completed`). See the dedicated section below.
- **GitHub/Vercel Publishing Provider** (Phase 6A): `lib/publishing/github/*` — `client.ts` (hand-rolled GitHub REST API client, no SDK), `auth.ts` (`GitHubAuthStrategy`, a Personal Access Token implementation now, a `GitHubApp` interface reserved for later), `errors.ts` (GitHub-specific error classification), `retry-strategy.ts` (branch/PR/merge idempotency, pure), `content-adapter.ts` + `markdown-adapter.ts` (the `WebsiteContentAdapter` boundary — see below), `provider.ts` (`GitHubPublishingProvider`, implementing the same `PublishingProvider` interface Phase 5's `WordPressPublishingProvider` does). `lib/publishing/provider.ts` gained one new optional field (`PublishPageInput.git`) and one new optional method (`getPublicationStatus`) — additive only, WordPress's file is untouched. One new job type, `MERGE_TO_PRODUCTION`, deliberately distinct from `PUBLISH_CONTENT` (which stays 100% WordPress-only); `CREATE_DRAFT` gained a GitHub branch at its very top, delegating before any existing WordPress code runs. See the dedicated section below.

```
app/
  admin/            internal admin UI (server components + server actions)
    automation/      job stats, scheduler runs, per-website schedule, manual controls
    websites/[id]/keywords/  Keyword Intelligence: stats, filters, run-discovery button
    websites/[id]/search-console/  Search Console: connect/site-picker, stats, metrics table
    websites/[id]/search-performance/  SEO Decision Engine: opportunities table, filters, status updates
    websites/[id]/competitors/  Competitor & SERP Intelligence: competitors, SERPs, provider usage
    websites/[id]/content/  Content Execution: brief list, per-brief review/editor page
    websites/[id]/publishing/  CMS connection form/status, recent publications
    websites/[id]/outcomes/  SEO Performance & Outcomes: overview, alerts, action outcomes, new-page lifecycle, autonomy level (Phase 6)
  api/               JSON API route handlers (Basic-Auth-gated, Phase 2D — see SECURITY_AUDIT.md)
    scheduler/run/    CRON_SECRET-gated scheduled sweep entrypoint (excluded from Basic Auth)
    websites/[id]/keyword-discovery/  manual KEYWORD_DISCOVERY trigger
    websites/[id]/search-console-sync/  manual SEARCH_CONSOLE_SYNC trigger
    websites/[id]/search-performance-analysis/  manual ANALYSE_SEARCH_PERFORMANCE trigger
    websites/[id]/serp-fetch/  manual FETCH_SERP_RESULTS trigger
    websites/[id]/action-outcomes-analysis/  manual ANALYSE_ACTION_OUTCOMES trigger (Phase 6)
    content-briefs/[id]/generate/  manual GENERATE_CONTENT trigger
    content-versions/[id]/publish/  manual PUBLISH_CONTENT trigger
    content-versions/[id]/merge-to-production/  manual MERGE_TO_PRODUCTION trigger, GitHub connections only (Phase 6A)
    auth/google-search-console/start|callback/  OAuth flow (callback excluded from Basic Auth by necessity; state-signed)
  dashboard/         client-facing portal (Supabase-session-gated, Phase 7) — separate from /admin, same underlying services
    login/, forgot-password/, reset-password/, accept-invite/  auth pages (public within /dashboard, Server Actions in auth-actions.ts)
    [orgSlug]/       every real page — layout.tsx is the sidebar/nav shell + membership gate
      opportunities/, tasks/, content/[briefId]/, publishing/, outcomes/, audit/, search-console/, keywords/, competitors/, reports/, settings/
    actions.ts       every data-mutating Server Action — role-checked via requireOrganizationMembership() + lib/auth/permissions.ts before calling the same lib/db/*/lib/jobs/* functions /admin uses
lib/
  supabase/          server-side client + generated Database types
    server-session.ts  request-scoped anon-key + user-session client (Phase 7) — RLS-respecting, used for auth operations
  auth/              session.ts (requireOrganizationMembership — the one authorisation choke point), permissions.ts (pure role->capability rules), users.ts (auth.users lookups via the Admin API) (Phase 7)
  dashboard/         website.ts — resolves "the" website for an organisation-scoped dashboard page (Phase 7)
  crawler/            crawl engine (fetchWithRedirects exported for reuse by competitor-page fetching)
  audit/               technical SEO rules + engine
  ai/                    provider abstraction, schemas, prompts, analysis service
  jobs/                 job runner, scheduler, pure policy/decision functions, per-job-type handlers
  keywords/              keyword provider abstraction (Null + DataForSEO) + pure normalize/match/score/merge modules
  search-console/        OAuth/API clients, signed state param, pure row-normalizer
  search-performance/    10 pure detectors (7 Phase 2D + 3 Phase 3), comparison/scoring/dedupe-key modules
  serp/                  SerpDataProvider abstraction, classification/scoring/aggregation/overlap/priority-tier modules (Phase 3)
  dataforseo/            shared low-level HTTP client used by both the SERP and keyword DataForSEO providers
  content/                ContentProvider abstraction, brief builder, deterministic+AI QA (qa/*), approval state-machine (Phase 4)
  publishing/             PublishingProvider abstraction, WordPress implementation, retry-strategy/errors/url/markdown pure modules (Phase 5)
    github/                 GitHub REST client, auth strategy, errors, retry-strategy, WebsiteContentAdapter + generic Markdown adapter, GitHubPublishingProvider (Phase 6A)
  outcomes/               pure baseline/window/delta/classification/recommendation/lifecycle/alert/autonomy/follow-up modules (Phase 6)
  api/                   lib/api/authorize.ts (IDOR guard), lib/api/respond.ts (route helpers)
  db/                    typed query helpers, one file per entity
supabase/migrations/  versioned SQL (source of truth; applied via Supabase MCP)
scripts/               seed.ts, run-pending-jobs.ts, run-scheduler.ts
SECURITY_AUDIT.md      Phase 2D API authorization audit — full route inventory + honest limitations
```

## Database schema

38 tables (2 gained new columns in Phase 6A: `cms_connections`, `content_publications`), UUID primary keys, `created_at`/`updated_at` timestamps, RLS enabled everywhere. See `supabase/migrations/` (`0001_init.sql` through `0027_client_portal_invitations.sql`) for the full source of truth.

- **organizations**, **memberships** (user↔org, role) — core multi-tenancy, built in Phase 1, actually exercised by real Supabase Auth sessions for the first time in Phase 7. `memberships.role` (Phase 7) is `OWNER`/`MANAGER`/`EDITOR`/`VIEWER` — the original Phase 1 labels (`owner`/`admin`/`member`) are still valid enum values (Postgres enums are add-only) but were never used by any app code and aren't part of the Phase 7 role model; `lib/auth/permissions.ts` treats any of them as the lowest rank rather than crashing.
- **organization_invitations** (Phase 7) — Owner/Manager invites an email to a role; an unguessable `token` (distinct from the row's own `id`) is the only thing the emailed link carries — acceptance always re-derives the organisation/role from this row server-side, never from the browser. A partial unique index blocks two simultaneous *pending* invitations for the same email in the same org; re-inviting after acceptance/revocation is fine.
- **websites** — per-org, with crawl limits (`crawl_max_pages`, `crawl_max_depth`), last-known robots.txt/sitemap availability, and five **independent** recurring schedules: `next_crawl_at`/`crawl_frequency_days` (default 7 — weekly), `next_keyword_discovery_at`/`keyword_discovery_frequency_days` (default 30 — monthly, Phase 2B), `next_search_console_sync_at`/`search_console_sync_frequency_days` (default 1 — daily, Phase 2C), `next_serp_fetch_at`/`serp_fetch_frequency_days` (default 7, Phase 3 — per-keyword HIGH/MEDIUM/LOW tiering is layered on top in application code, see below), and `next_action_outcomes_at`/`action_outcomes_frequency_days` (default 1 — daily, Phase 6; cheap to run daily since the job is a no-op when nothing is due). Also `default_serp_location` (Phase 3) — a free-text location (e.g. `"Coventry,England,United Kingdom"`) used for that website's SERP requests; local SEO isn't globally interchangeable. `status='active'` doubles as the "eligible for scheduling" flag for all five; `paused`/`archived` websites are skipped. `ANALYSE_SEARCH_PERFORMANCE` (Phase 2D) and the Phase 3 competitor jobs have no schedule column of their own — they chain after a completed sync/fetch instead (see "Scheduler" below); `ANALYSE_ACTION_OUTCOMES` (Phase 6) deliberately does *not* chain the same way — see its own section. `business_description`/`target_audience`/`brand_voice`/`content_constraints` (Phase 4) — nullable, admin-editable business facts the content brief reads; never auto-filled, a null value is surfaced to both the human reviewer and the QA factuality check instead. `autonomy_level` (Phase 6, default `AI_RECOMMENDS`) — see "Autonomy levels" below.
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
- **search_performance_opportunities** (Phase 2D, extended in Phase 3) — one row per (website, detector, subject): `detector_type` (10 values — 7 from Phase 2D, 3 competitor-sourced from Phase 3), nullable `keyword_id`/`page_id`/`related_page_id`, a `signals` jsonb snapshot of exactly the measured/deterministic inputs the score was computed from, `opportunity_score`, `recommended_action`, deterministic `reasoning`, optional `ai_rationale`/`ai_risk_notes`/`ai_analysed_at`, and a `seo_opportunity_id` back-reference once promoted. Idempotency is via a deterministic `dedupe_key` (unique per website), not a multi-column constraint — see "SEO Decision Engine" below for why.
- **serp_runs** (Phase 3) — one row per (keyword, location, point-in-time) SERP request: `keyword`/`location`/`country`/`language`/`search_engine`, `status` (reuses the `job_status` enum), `features` jsonb (local pack/featured snippet/FAQ/etc for that SERP), `raw_response` jsonb (debugging only, no retention job yet — flagged). A time series, not deduped by constraint — "avoid duplicate runs" is an application-logic concern (`lib/serp/priority-tier.ts`'s per-keyword due-check), not a DB rule, since historical runs are the whole point (ranking-gap detection needs them).
- **serp_results** (Phase 3) — one row per ranked item within a `serp_run`: `position`/`domain`/`url`/`title`/`description`/`result_type` (kept as free text — DataForSEO's own evolving vocabulary, not ours) /`is_client_domain`.
- **competitor_domains** (Phase 3) — one row per (website, domain), aggregated/classified/scored from `serp_results`: `classification` (`DIRECT_COMPETITOR`/`DIRECTORY`/`MARKETPLACE`/`INFORMATIONAL`/`OTHER`/`UNKNOWN`), `appearances`, `average_position`, `relevant_keyword_count`, `relevance_score`. `unique(website_id, domain)` prevents duplicates.
- **competitor_pages** (Phase 3) — structured metadata only for selected high-value competitor pages (title/meta/H1/headings/word count/structured-data types/a simple deterministic `major_topics` extraction) — **never body text or raw HTML**, competitive analysis not content reproduction. `unique(competitor_domain_id, url)`.
- **provider_usage** (Phase 3) — the foundation for future cost tracking: provider/operation/units/`estimated_cost_usd` (from a documented published-rate constant, never a fabricated precise figure) per organization/website. Not a billing system.
- **competitors** — manual entry only; no scraping (Phase 1 — distinct from the Phase 3 `competitor_domains`/`competitor_pages`, which are auto-populated from real SERP data).
- **seo_opportunities** — recommendations (`CREATE_NEW_PAGE` / `OPTIMISE_EXISTING_PAGE` / `TECHNICAL_FIX` / `INTERNAL_LINKING` / `RESEARCH_REQUIRED`, plus Phase 2D's `IMPROVE_CTR` / `INVESTIGATE_DECLINE` / `INVESTIGATE_OPPORTUNITY` / `IMPROVE_INTERNAL_LINKING`), with `priority_score` + `priority_components` and an `ai_job_id` back-reference. Populated by Phase 1's page-level AI analysis, Phase 2B's keyword-opportunity promotion, and Phase 2D's search-performance-opportunity promotion — one system, three feeders.
- **opportunity_keywords** — join table (Phase 1), reused as-is by Phase 2B to link a promoted keyword to its `seo_opportunities` row.
- **seo_tasks** — one task per stored opportunity (also usable standalone later), with its own status lifecycle.
- **ai_jobs** — one row per individual AI provider call: provider, model, prompt version, token usage, latency, status, result. Distinct from `jobs` — a single `GENERATE_SEO_OPPORTUNITIES`/`KEYWORD_DISCOVERY` job makes exactly one AI call today, but the schema allows more later without migration. Every Phase 4 content AI call (generation/revision/metadata/QA) also logs here — no separate cost-tracking mechanism was built.
- **content_briefs** (Phase 4) — one row per `seo_opportunities` row a human turned into a brief: `content_type` (reuses `opportunity_type` — only `CREATE_NEW_PAGE`/`OPTIMISE_EXISTING_PAGE`), `primary_keyword`/`primary_keyword_id`, `target_url`, `status` (`DRAFT`/`SUBMITTED` — has generation started yet), and `brief_data` jsonb — the full structured `ContentBrief` captured once at creation, so the brief a human reviewed is exactly what the provider receives later. `seo_task_id` completes the opportunity→task→brief traceability chain.
- **content_jobs** (Phase 4) — one row per brief's generation *effort* (not per async step — those are ordinary `jobs` rows, linked back via `jobs.payload->>'content_job_id'`). `status` is the human-facing lifecycle (`DRAFT`/`QA_PENDING`/`QA_FAILED`/`NEEDS_REVIEW`/`READY_FOR_APPROVAL`/`APPROVED`/`REJECTED`) — independent of the underlying `jobs.status`, which only tracks whether a step is currently running (same split as `seo_audits.status` vs `jobs.status`). `attempts` counts revisions consumed.
- **content_versions** (Phase 4) — every draft/revision, never overwritten; `unique(content_brief_id, version_number)`. SEO title/meta description/suggested URL/H1 live in `metadata` jsonb, separate from `content` (the body).
- **content_qa_results** (Phase 4) — the full deterministic+AI QA breakdown for one version: `passed`/`score`/`deterministic_checks`/`ai_feedback`/`issues`, plus `ai_job_id` (nullable — null when the AI QA call was skipped/failed, a soft failure) and `model`/`prompt_version`. `content_versions.qa_status` is a fast summary column; this table is the detail.
- **cms_connections** (Phase 5, extended Phase 6A) — one row per website (`unique(website_id)`): `provider` (`'wordpress'` | `'github'`), `base_url`/`username` (WordPress-only, nullable since Phase 6A), `credential_secret_id` (a **Supabase Vault** secret id — the encrypted Application Password *or* GitHub token lives in `vault.secrets`/`vault.decrypted_secrets`, never in this table; see "Publishing Engine"/"GitHub/Vercel Publishing Provider" below), `status` (`pending`/`pending_repo_selection` (Phase 6A, GitHub-only)/`active`/`error`), `last_tested_at`/`last_test_error`. New Phase 6A columns, all nullable: `github_owner`/`github_repo`/`github_production_branch`/`github_account_login`, `github_publication_mode` (`GITHUB_BRANCH_ONLY`/`GITHUB_PULL_REQUEST`[default]/`GITHUB_MERGE`), `vercel_project_id` (unused today — no Vercel API call is made, see below). Any credential change resets `status` to `pending`/`pending_repo_selection` — a connection is never trusted again until explicitly re-tested.
- **content_publications** (Phase 5, extended Phase 6A) — **one row per content_version's publication lineage**, updated in place across every retry (not re-inserted) — this is what makes an `external_id`/`branch_name`/`pull_request_number` learned on attempt 1 visible to attempt 2's duplicate-prevention check. `publication_type` reuses `opportunity_type` (only `CREATE_NEW_PAGE`/`OPTIMISE_EXISTING_PAGE`); `status` (`PENDING`/`PUBLISHING`/`DRAFTED`/`PUBLISHED`/`FAILED`/`UNPUBLISHED`, plus Phase 6A's `BRANCH_CREATED`/`COMMITTED`/`PR_CREATED`/`PREVIEW_READY`/`AWAITING_PRODUCTION_APPROVAL`/`MERGING`/`DEPLOYING` — one state system, not two); `provider_response_metadata` jsonb holds only a non-sensitive subset of the provider's response, never credentials. New Phase 6A columns, all nullable (a WordPress row never populates them): `branch_name`, `base_commit_sha`/`commit_sha`/`production_commit_sha` (the "preserve previous/new commit SHA" rollback-safety trio), `pull_request_number`/`pull_request_url`, `preview_url`.
- **publication_audit_log** (Phase 5) — who approved/initiated what, when, and the result — `action`/`actor`/`target_url`/`result`/`failure_reason`. `actor` is currently always the constant `"admin"` (there is no per-user auth system yet — see `SECURITY_AUDIT.md`'s documented, deferred limitation); this is an honest placeholder, not fabricated per-user attribution, ready for real identity once it exists.
- **seo_actions** (Phase 6) — the traceability spine: one row per executed SEO action, connecting a `content_publications` row (or a completed non-content `seo_task_id`) to a `target_url`/`target_keyword_id`/`target_keyword_text`. `action_type` is its own 8-value enum (deliberately not a reuse of `opportunity_type`/`detector_type` — see migration `0021`'s comment). `executed_at` is what baseline/measurement windows are computed relative to. `baseline_*` columns hold the pre-action snapshot, captured exactly once (`baseline_captured_at`) and never overwritten. `hypothesis`/`expected_outcome`/`measurement_window_days`/`conclusion` are nullable, unused-by-default columns laying the ground for future real experiments (Phase 6 explicitly does not build A/B testing) — see "Experimental tracking foundation" below.
- **seo_action_outcomes** (Phase 6) — one row per `(seo_action, measurement_window_days ∈ {7,14,28,56})`, upserted so re-running analysis before a window's numbers meaningfully change just refreshes the row. Holds `baseline_metrics`/`current_metrics`/`deltas` jsonb snapshots, a deterministic `data_sufficient` flag + `classification` (`POSITIVE`/`NEGATIVE`/`MIXED`/`INCONCLUSIVE`/`INSUFFICIENT_DATA`) + `classification_reasoning`, a deterministic `recommendation`, an optional `page_lifecycle_stage` (new pages only), and separate `ai_interpretation`/`ai_risk_notes`/`ai_analysed_at` columns — additive AI output never mixed with the deterministic fields. `follow_up_task_id` is the duplicate-follow-up-task-prevention mechanism.
- **seo_alerts** (Phase 6) — internal notifications, only ever created when a configurable threshold in `lib/outcomes/alerts.ts` is exceeded; deduplicated per `(seo_action_outcome_id, alert_type)` via a unique index so re-running analysis never spams the same alert twice.

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
| `DATAFORSEO_LOGIN` / `DATAFORSEO_PASSWORD` | Optional — only needed for the Competitor & SERP Intelligence integration (Phase 3). Your DataForSEO account login/password. See "Competitor & SERP Intelligence" below. Everything else works with zero DataForSEO setup. |
| `CONTENT_PROVIDER` | Optional, defaults to `ai` — selects which `lib/content/*-provider.ts` implementation `lib/content/get-provider.ts` returns (Phase 4). Only `ai` (built on `AI_PROVIDER` above) exists today. |

**No new environment variable for Phase 5.** WordPress credentials are per-website, entered through the admin UI (Publishing page) and encrypted via Supabase Vault — already installed on this project, so there's no key to generate or manage. See "Publishing Engine" below.

## Local development

```bash
npm install
npm run dev       # http://localhost:3000 (admin at /admin, prompts for ADMIN_PASSWORD via Basic Auth)
npm run typecheck
npm test           # pure-function unit tests: audit rules, job scheduling policy, keyword/search-console/search-performance/serp/dataforseo/content/publishing modules, API authorization guard (node:test)
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
3. **Enqueue due jobs** — for each `status='active'` website whose relevant `next_*_at` has passed (or is `null`), create the corresponding job, skipping any website that already has one `PENDING`/`PROCESSING` (the existing idempotency-key index handles this): `CRAWL_WEBSITE`, `KEYWORD_DISCOVERY` (Phase 2B), `SEARCH_CONSOLE_SYNC` (Phase 2C, scoped to only websites with an `active` `search_console_connections` row), and `FETCH_SERP_RESULTS` (Phase 3, no connection prerequisite — the SERP provider needs no per-website OAuth).
4. **Drain the queue** — runs the bounded worker loop (up to 4 minutes / 30 iterations, `lib/jobs/policy.ts`), re-querying between jobs so a job chained mid-sweep gets processed in the same invocation when there's time left. Chaining: `CRAWL_WEBSITE → RUN_SEO_AUDIT → GENERATE_SEO_OPPORTUNITIES`, `SEARCH_CONSOLE_SYNC → ANALYSE_SEARCH_PERFORMANCE` (Phase 2D), and `FETCH_SERP_RESULTS → ANALYSE_COMPETITORS → ANALYSE_COMPETITOR_GAPS` (Phase 3) — each completed job in a chain automatically triggers its successor, same `getNextJobType` mechanism, no new scheduler phase needed per chain link.
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

As of Phase 3, `lib/keywords/dataforseo-provider.ts` is a real `KeywordDataProvider` implementation — set `DATAFORSEO_LOGIN`/`DATAFORSEO_PASSWORD` (see "Competitor & SERP Intelligence" below) and `lib/keywords/get-provider.ts` picks it automatically; no code change needed. To add a *different* provider instead:

1. Implement `KeywordDataProvider` in a new file, calling the real API and mapping its response onto `KeywordMetricsResult`/`KeywordSuggestion` — never inventing a field the API didn't return.
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

## Competitor & SERP Intelligence (Phase 3)

The platform's first *external competitive* signal: who else ranks for the client's important keywords, via DataForSEO's SERP API, feeding the *existing* SEO Decision Engine (Phase 2D) rather than a fourth parallel opportunity system.

### Provider abstraction

- **`lib/dataforseo/client.ts`** — one shared, hand-rolled `fetch` client (Basic Auth, DataForSEO's task-envelope unwrapping, best-effort error classification via `mapDataForSeoError`) used by both providers below. No SDK, same philosophy as the crawler and Search Console client.
- **`SerpDataProvider`** (`lib/serp/provider.ts`/`get-provider.ts`, mirrors `KeywordDataProvider`'s shape exactly): a single `getSerpResults(keyword, opts)` method — deliberately not three separate methods for "results"/"ranked results"/"competitors," since those are pure deterministic *derivations* of one SERP fetch, not separate provider round-trips (keeps DataForSEO credit usage to one call per keyword). `DataForSeoSerpProvider` is the real implementation; `NullSerpProvider` (the default with no credentials) honestly returns nothing.
- **`KeywordDataProvider`** now also has a real implementation: `lib/keywords/dataforseo-provider.ts`, wired into the existing Phase 2B factory with zero interface changes.

### SERP collection — `FETCH_SERP_RESULTS`

Selects up to `MAX_KEYWORDS_PER_SERP_FETCH_RUN` (10) *due* keywords per run — not every keyword indiscriminately. Each keyword gets a priority tier (`lib/serp/priority-tier.ts`'s `getSerpPriorityTier`) from existing signals (a matched `keyword_opportunities.opportunity_score`, an existing `PAGE_TWO_OPPORTUNITY` row, recent GSC impressions):

| Tier | Qualifying signal | Refetch cadence |
|---|---|---|
| HIGH | score ≥ 8, or a page-two opportunity exists, or ≥ 500 recent impressions | 7 days |
| MEDIUM | score ≥ 4, or ≥ 100 recent impressions | 14 days |
| LOW | none of the above | 30 days |

`isKeywordDueForSerpFetch` checks each keyword's own tier window against its last successful `serp_run` — the actual "avoid duplicate SERP runs" mechanism (a website-level `next_serp_fetch_at`/`serp_fetch_frequency_days` schedule just decides when the job itself runs; per-keyword tiering happens inside it). Results are stored in `serp_runs`/`serp_results`, the client's own domain is flagged (`lib/serp/client-domain.ts`), and `location`/`country`/`language` are stored per request — **local SEO isn't globally interchangeable**; set a website's `default_serp_location` on the Competitors admin page. Per-keyword provider failures are soft (logged to that keyword's `serp_run`, the batch continues); the job only fails outright (flowing into the existing retry policy) if every attempted keyword failed.

### Competitor identification — `ANALYSE_COMPETITORS`

Deterministic, not AI, per spec: `lib/serp/classify-domain.ts` pattern-matches known Google-property/directory/marketplace/social/informational domains to an immediate classification (`DIRECTORY`/`MARKETPLACE`/`INFORMATIONAL`/`OTHER`); anything else starts `UNKNOWN` and only becomes `DIRECT_COMPETITOR` once it's appeared for at least `MIN_APPEARANCES_FOR_DIRECT_COMPETITOR` (2) distinct keywords — "repeatedly appears... and is not the client's own domain," per spec. `lib/serp/aggregate-competitors.ts` reduces raw `serp_results` into one row per domain (appearances, average position, relevant-keyword count) and computes the score below. AI enrichment of the remaining `UNKNOWN`/`OTHER` domains is a documented future step, not built now.

Then fetches+analyzes up to `MAX_COMPETITOR_PAGES_PER_RUN` (10) of the most relevant `DIRECT_COMPETITOR` pages — never every competitor URL automatically. `lib/serp/fetch-competitor-page.ts` reuses the crawler's own `fetchWithRedirects`/`parseHtml`/robots-respecting logic (not a second crawler) and stores **structured metadata only** (`competitor_pages`: title/meta/H1/headings/word count/structured-data types/a simple deterministic `major_topics` word-frequency extraction) — **never body text or raw HTML**. Competitive analysis, not content reproduction.

### Competitor relevance score

`lib/serp/competitor-scoring.ts`, documented formula, explicitly **not** Google's authority/domain-rating score:

```
score = relevantKeywordSignal × 1.2 + positionStrength × 1.3 + appearanceFrequency × 1.0 + commercialCoverage × 1.1 + targetOverlap × 1.4
```

All five inputs are deterministically derived 1-5 values (log-scaled counts, inverse-scaled position, ratios) — an internal competitive-relevance score for prioritising which competitors matter, nothing more.

### Gap detection — `ANALYSE_COMPETITOR_GAPS`

Three more `detector_type` values in the *existing* `search_performance_opportunities` table (Phase 2D), same `SearchPerformanceCandidate` shape as the other 7:

| Detector | Signal | Recommended action |
|---|---|---|
| `COMPETITOR_CONTENT_GAP` | A `DIRECT_COMPETITOR` ranks well (top 10) for a keyword the client has no adequate page for | `CREATE_NEW_PAGE` |
| `COMPETITOR_RANKING_GAP` | Both rank, but the competitor substantially outranks the client (≥ 5 positions, `DIRECT_COMPETITOR` only — directories/marketplaces/etc. are excluded from ranking comparisons) | `OPTIMISE_EXISTING_PAGE` |
| `SERP_FEATURE_OPPORTUNITY` | A high-priority keyword's SERP includes a feature (featured snippet/local pack/FAQ) the client doesn't hold | `IMPROVE_CTR` |

Never assumes copying competitor content will improve rankings — the deterministic `reasoning` states the measured fact only (positions, evidence), and the optional AI-interpretation pass (same bounded, additive, no-invented-numbers pass Phase 2D built) is what may suggest a content direction, explicitly instructed not to claim a guaranteed outcome and to flag possible keyword cannibalisation.

**Pipeline extraction**: `lib/jobs/handlers/search-performance-shared.ts` (`upsertSearchPerformanceCandidates`/`runAiInterpretationPass`/`promoteSearchPerformanceOpportunities`) was pulled out of `analyse-search-performance.ts` in this phase so `analyse-competitor-gaps.ts` uses the *exact same* scoring/AI/promotion code path — verified by re-running Phase 2D's existing test suite unchanged after the refactor.

### Cost control

- Keyword prioritisation + per-tier refetch cadence (above) — no indiscriminate SERP collection.
- `MAX_COMPETITOR_RESULTS_CONSIDERED_PER_KEYWORD` (10) and `MAX_COMPETITOR_PAGES_PER_RUN` (10) bound per-run work.
- `provider_usage` logs every DataForSEO call (provider/operation/units/`estimated_cost_usd` — from a documented published-rate constant, `DATAFORSEO_SERP_COST_ESTIMATE_USD`, never a fabricated precise figure) — the foundation for a future cost dashboard, visible on the Competitors admin page ("Provider usage, last 30 days").

### Setting up DataForSEO credentials

1. Create an account at [DataForSEO](https://dataforseo.com/) (has a free trial with credits).
2. Add `DATAFORSEO_LOGIN` (your account email) and `DATAFORSEO_PASSWORD` to `.env.local`.
3. Nothing else needed — both providers pick this up automatically via their factories.

### Testing the integration

Via the admin UI: open a website's Competitors page (`/admin/websites/[id]/competitors`), optionally set a **Default SERP location**, and click **Fetch SERP results** — this chains automatically through competitor analysis and gap detection. Via the API:

```bash
curl -X POST http://localhost:3000/api/websites/<website-id>/serp-fetch -u admin:$ADMIN_PASSWORD
```

Results appear on the Competitors page (competitors table, recent SERPs, provider usage) and, for content/ranking/SERP-feature gaps, on the existing [SEO Decision Engine page](#seo-decision-engine-phase-2d) filtered to the 3 new detector types. Re-run the whole chain twice to confirm no duplicate `serp_runs`/`competitor_domains`/opportunities/tasks.

## Content Execution Engine (Phase 4)

Turns a prioritised `seo_opportunities` row into an actual page draft — the platform's first *execution*, not just detection, layer. Nothing here publishes anywhere; approval only means "ready for Phase 5 publishing."

### Before writing any integration code

The spec required inspecting whether an existing CV Central content-generation engine could be reached from this repository/environment, and stopping rather than inventing an integration if not. It couldn't: no code, no deployed API, no credentials anywhere in `.env.local`/`.env.example`, no sibling repo anywhere on the machine. "CV Central" has only ever been the client *website* this platform audits (a database row), never a codebase with a boundary into it. `ContentProvider`'s initial implementation is therefore `AiContentProvider`, built on the platform's own existing `AIProvider` — the interface is designed so a real `CvCentralContentProvider` can be dropped in later (`lib/content/get-provider.ts`'s `CONTENT_PROVIDER` env var is the seam), but that file isn't created now.

### Eligibility

A `seo_opportunities` row is content-eligible iff `type` is `CREATE_NEW_PAGE` or `OPTIMISE_EXISTING_PAGE` (`lib/content/eligibility.ts`). This single gate covers the spec's full "initial supported opportunity types" list: `CONTENT_GAP`/`COMPETITOR_CONTENT_GAP`/`PAGE_TWO_OPPORTUNITY` are `detector_type` values, not `opportunity_type` values — by the time any of those detectors reach `seo_opportunities`, they've already resolved to one of the two eligible types.

### The content brief

`lib/content/build-brief.ts`'s pure `buildContentBrief()` assembles a structured `ContentBrief` (organization/website business context, the opportunity, detector signals when the opportunity was Phase 2D/3-promoted, primary/secondary keywords, real Search Console rows, real keyword-provider metrics, structured-metadata-only competitor pages, content gaps, recommended topics, real-page-only internal-link suggestions, and an explicit `missingBusinessInfo` list) from already-collected data — zero AI, zero fabrication. `lib/content/create-brief.ts` does the DB-reading half (reusing every relevant Phase 1-3 query) and stores the result verbatim in `content_briefs.brief_data`, so the brief a human reviews is exactly what the provider receives later. A website's `business_description`/`target_audience`/`brand_voice`/`content_constraints` (editable on the Content page) are never guessed — a blank field becomes a `missingBusinessInfo` entry instead.

### Generation, QA, and the revision loop

Three job types, each an ordinary row in the existing `jobs` table (`GENERATE_CONTENT` → `QA_CONTENT` → `READY_FOR_APPROVAL` or → `REVISE_CONTENT` → `QA_CONTENT` again):

- **`GENERATE_CONTENT`** (`lib/jobs/handlers/generate-content.ts`) — calls `ContentProvider.generateContent`/`generateMetadata`, stores `content_versions` #1, moves the `content_jobs` row to `QA_PENDING`.
- **`QA_CONTENT`** (`lib/jobs/handlers/qa-content.ts`) — `lib/content/qa/deterministic.ts` runs ~13 pure checks (primary keyword presence, title/H1/meta presence+bounds, heading structure, keyword-stuffing density, empty/short content, malformed markdown, placeholder-text patterns, required-topic coverage, **internal links validated against real `website_pages` URLs — a link to a page that doesn't exist is a blocking failure**, and a business-claim safeguard blocking invented pricing/guarantees/certifications/statistics/testimonial-like quotes). `lib/content/qa/ai-qa.ts` makes one soft-failing AI call (same try/catch pattern as Phase 2D's interpretation pass) rating intent-alignment/topical-coverage/usefulness/clarity/business-relevance/competitor-gap-coverage 1-5 plus two booleans — no numeric "score" field the model could invent. `lib/content/qa/compute-result.ts` (pure TypeScript) combines both into pass/fail + a 0-100 score: **passing requires every blocking check to pass** regardless of score, so AI is informative, never gating by itself.
- **`REVISE_CONTENT`** (`lib/jobs/handlers/revise-content.ts`) — feeds the latest QA issues (+ optional human free-text instructions) to `ContentProvider.reviseContent`, stores a new `content_versions` row (previous ones are never overwritten).

Chaining is deliberately **not** the generic website-scoped `advancePipeline()` mechanism (`lib/jobs/policy.ts`'s `getNextJobType` returns `null` for all three) — its `idempotency_key = "{nextType}:{websiteId}"` scoping would collide across two different briefs on the same website, since many can be generating at once. Each handler instead creates its own next stage directly, scoped by `content_job_id`.

Automatic revision only continues while `content_jobs.attempts < MAX_CONTENT_REVISIONS` (2); once exhausted, the job moves to `NEEDS_REVIEW` and stops — a human can still click **Revise** manually from there (an explicit override, not a resumed loop). `lib/content/state-machine.ts`'s `canTransitionContentJob` is the single source of truth for every legal status change (`DRAFT → QA_PENDING → READY_FOR_APPROVAL/QA_FAILED/NEEDS_REVIEW → APPROVED/REJECTED`), checked before every mutation, automatic or human.

### Human approval

`content_jobs.status` (independent of the underlying async `jobs.status` — see the database section above) is what the admin UI's Generate/Run QA/Revise/Approve/Reject actions read and mutate. `APPROVED` means "approved for Phase 5 publishing" — nothing is published. `APPROVED`/`REJECTED` are terminal; a fresh attempt from `REJECTED` creates a new `content_jobs` row for the same brief.

### Traceability

Every content_job traces back through `content_briefs.seo_opportunity_id` → `seo_opportunities` → (`seo_task_id` →) `seo_tasks`, and — when the opportunity was Phase 2D/3-promoted — through the brief's `detector` field back to the originating keyword/competitor signal. The `landlord accountant Coventry` chain from the spec (keyword → GSC → competitor gap → opportunity → task → brief → draft → QA → approval) is fully walkable from the brief detail page.

### Cost control

Every AI call (generation, revision, metadata, QA) logs to the existing `ai_jobs` table (provider/model/tokens/latency) — no separate tracking mechanism. Brief assembly bounds competitor pages/Search Console rows/secondary keywords/internal-link suggestions to named constants in `lib/content/limits.ts`, same convention as every prior phase's `limits.ts`.

### Testing the pipeline

Via the admin UI: open a website's Content page (`/admin/websites/[id]/content`), fill in the business profile (optional but recommended), click **Generate brief** next to an eligible opportunity, then **Generate content** on the brief page — this chains automatically through QA (and revision, if needed). Via the API:

```bash
curl -X POST http://localhost:3000/api/content-briefs/<brief-id>/generate -u admin:$ADMIN_PASSWORD
```

Draining the queue (`npm run jobs:sweep`, the automation page's "Process pending jobs", or the scheduler sweep) is required between stages, same as every other job pipeline in this platform.

## Publishing Engine (Phase 5)

Turns `APPROVED` content into a real, public page on the client's own WordPress site. The rule that shapes every design decision in this phase: **there is no path from AI-generated content to a live page without an explicit human "Publish" click**, and every publish request re-verifies `content_jobs.status === 'APPROVED'` server-side, from the database, on every single attempt — never trusted from the browser, never cached from a moment ago.

### Credential storage

The spec required identifying the safest credential-storage mechanism available in the existing architecture, or flagging the requirement rather than introducing a plaintext workaround. One *is* available: **Supabase Vault** (the `vault` schema + `pgsodium`) was already installed on this project — confirmed via `list_extensions` before writing any migration. Four `SECURITY DEFINER` wrapper functions in `public` (`cms_credential_create/read/update/delete`, migration `0018`, granted to `service_role` only — PostgREST can't reach the `vault` schema directly) bridge the app's existing `supabaseAdmin()` client to it. A WordPress Application Password is encrypted the moment it's submitted; `cms_connections.credential_secret_id` only ever stores a reference (a `vault.secrets.id`), never the secret itself — it doesn't appear in a plain `select *`, doesn't appear in any admin page after saving, and is only ever decrypted server-side, in-process, immediately before a WordPress API call (`lib/db/cms-connections.ts`'s `getDecryptedCredential`).

### `PublishingProvider` abstraction

`lib/publishing/provider.ts` — `testConnection`/`createDraft`/`publish`/`update`/`getPublishedPage`/`findBySlug`/`unpublish`. `lib/publishing/wordpress-provider.ts` is the first implementation: hand-rolled `fetch` (no SDK, same philosophy as the crawler/Search Console/DataForSEO clients) against the official WordPress REST API's `/wp/v2/pages` resource, authenticated via HTTP Basic Auth with a WordPress **Application Password** — WordPress's own official mechanism for exactly this, never the account's real login password. `lib/publishing/get-provider.ts` is a per-call factory (unlike `lib/ai/get-provider.ts`'s process-wide singleton) since credentials are per-website. Adding Webflow/Shopify/a custom CMS later is one more provider file and one more factory branch — no call-site changes.

### Duplicate-publication prevention

The spec calls this "critical," so it gets two independent layers:

1. `jobs.idempotency_key = "{CREATE_DRAFT|PUBLISH_CONTENT}:{content_version_id}"` — the same partial-unique-index mechanism every other job type already uses, preventing two concurrent jobs for the same version.
2. `content_publications` is **one row per content_version's publication lineage**, updated in place across every retry (never re-inserted) — an `external_id` learned on attempt 1 is exactly what attempt 2 sees. Before ever creating a page on a retry (`jobs.retry_count > 0`) with no known `external_id`, the handler calls `provider.findBySlug()` first — if WordPress already has a page at that exact slug (an earlier attempt that timed out or errored ambiguously, but actually succeeded), it's *adopted* instead of duplicated. The decision itself is a pure, unit-tested function (`lib/publishing/retry-strategy.ts`'s `decidePublishAction`), independent of any live WordPress call.

### Permanent vs. retryable failures

`lib/publishing/errors.ts`'s `mapWordPressError` classifies 401/403 (bad credentials), 404 (target missing), and 409 (conflict) as **permanent**; 429 (rate limit), 5xx, and network timeouts as **retryable**. Content-not-APPROVED, an org/website mismatch, and an inactive CMS connection are also permanent. A new, generic job-engine primitive makes this actionable: `lib/jobs/types.ts`'s `PermanentJobError` — any handler can throw it to mean "this will never succeed on retry," and `lib/jobs/runner.ts`'s `processJob` jumps `retry_count` straight to `max_retries` when it catches one, so `lib/jobs/policy.ts`'s existing `isRetryEligible` naturally never fires again. No second retry system, one small hook into the one that already existed.

### `CREATE_DRAFT` and `PUBLISH_CONTENT`

Two explicit job types, never auto-chained into each other (`getNextJobType` returns `null` for both — many `content_publications` can be in flight per website, same reasoning as Phase 4's content jobs). `CREATE_DRAFT` (`lib/jobs/handlers/create-draft.ts`) always forces WordPress `status: draft`, at two layers — the handler and the provider both refuse to publish, so a draft is never publicly visible even if a caller passed the wrong flag. `PUBLISH_CONTENT` (`lib/jobs/handlers/publish-content.ts`) checks whether a `CREATE_DRAFT` already produced an `external_id` for this same publication row and, if so, flips that *same* WordPress page from draft to published — never a second page. Both share their re-validation logic (`lib/jobs/handlers/publishing-shared.ts`'s `loadAndValidatePublishingContext`) so the checks can't drift between the two.

### Existing pages vs. new pages

`content_briefs.content_type` (already known from Phase 4) decides everything: for `OPTIMISE_EXISTING_PAGE`, `lib/publishing/url.ts`'s `resolvePublicationTargetUrl` always uses the brief's real `existingPage.url` — **never** the AI's own `targetUrl` recommendation, even when they differ — and the corresponding WordPress page is *looked up* by slug before any update; not found is a permanent, human-facing error, never a silent fallback to creating a new page. For `CREATE_NEW_PAGE`, the brief's recommended slug is used, and an `update()` call never sends a `slug` field at all — an existing page's URL is never changed by a content update, regardless of what any AI recommendation says.

### Metadata mapping

Title → WordPress `title`; body (Markdown, from `content_versions.content`) → WordPress `content` via `lib/publishing/markdown.ts`'s small pure converter (headings/paragraphs/bold/italic/links/lists — exactly what the content-generation prompt produces, not a general CommonMark implementation); `metadata.metaDescription` → WordPress's *native* `excerpt` field. Per spec's explicit instruction not to invent plugin APIs: **Yoast/RankMath meta fields are not set** (that would need a verified, separate integration), and featured image/categories/tags are not implemented — Phase 4's content system has no image pipeline or taxonomy data to map yet, so there's nothing to wire up.

### Audit trail

`publication_audit_log` (migration `0018`) records every `CONTENT_APPROVED`/`DRAFT_CREATED`/`DRAFT_CREATE_FAILED`/`PUBLISHED`/`PUBLISH_FAILED` event against its `content_version_id`, with the target URL and a failure reason where relevant. `actor` is currently always the constant `"admin"` — there is no per-user auth system yet (`SECURITY_AUDIT.md`'s documented, deferred limitation) — recorded honestly rather than inventing per-user attribution; the table is ready for real identity once that exists.

### Testing the pipeline

Admin UI: connect WordPress on a website's Publishing page (`/admin/websites/[id]/publishing`) with its site URL, username, and an **Application Password** (WordPress Admin → Users → Profile → Application Passwords) — click **Test Connection**. On an approved content brief's page, the Publishing section shows connection status and offers **Create Draft** / **Publish**, both disabled unless the content is `APPROVED` and the connection is `active`; a `FAILED` publication relabels the same buttons as **Retry**. Via the API:

```bash
curl -X POST http://localhost:3000/api/content-versions/<version-id>/publish -u admin:$ADMIN_PASSWORD
```

## Autonomous SEO Optimisation Loop (Phase 6)

Connects everything the platform has already built into a closed loop: an executed SEO action → real Google Search Console performance → a deterministic, cautious measurement of what happened → an optional AI interpretation → (sometimes) a new task, created through the *same* `seo_opportunities`/`seo_tasks` system every earlier phase feeds. Nothing in this phase publishes, modifies, or deletes anything — it only measures and recommends.

### Critical principle: describe, don't claim causality

SEO performance is affected by many factors this platform cannot see — algorithm updates, seasonality, competitor moves, other site changes. Every deterministic reasoning string and every AI interpretation uses observational language ("Position improved from 14.2 to 9.8 following publication") and the classification vocabulary is deliberately non-causal: `POSITIVE`/`NEGATIVE`/`MIXED`/`INCONCLUSIVE`/`INSUFFICIENT_DATA`, never "this change caused X". `lib/outcomes/classify.ts`'s reasoning text is unit-tested to never contain a causal phrase (`classify.test.ts`), and the AI system prompt (`lib/ai/prompts/action-outcomes.ts`) states the same rule explicitly, with a matching schema (`lib/ai/schemas.ts`'s `actionOutcomeInterpretationSchema`) that has no field for a number the model could invent or a field that could override the classification it was given.

### Action tracking

`seo_actions` (`lib/db/seo-actions.ts`) is created at exactly two points, never speculatively:

1. **`lib/jobs/handlers/record-seo-action.ts`'s `recordSeoActionForPublication`**, called from `publish-content.ts` the moment a `content_publications` row reaches `PUBLISHED` — `action_type` comes from `lib/outcomes/action-type.ts`'s `deriveActionType()`, which prefers the originating Phase 2D/3 detector type (e.g. `COMPETITOR_CONTENT_GAP`) over the opportunity's own generic `CREATE_NEW_PAGE`/`OPTIMISE_EXISTING_PAGE` when one is known, for full traceability back to *why* the action happened.
2. **`recordSeoActionForCompletedTask`**, called from `app/admin/actions.ts`'s `updateTaskStatusAction` when a task is marked `completed` — covers `TECHNICAL_FIX`/`IMPROVE_INTERNAL_LINKING`/etc., which never go through the content pipeline. Deliberately a no-op for content-eligible opportunity types (those are handled by path 1, with a real published URL, not a task-completion timestamp that may precede or never reach actual publication).

Both paths are idempotent: a `content_publication_id` has at most one `seo_actions` row (DB-enforced, partial unique index), and a duplicate task-completion click is checked before inserting.

### Baseline snapshot

Captured exactly once per action, on the first `ANALYSE_ACTION_OUTCOMES` run after `executed_at`: `lib/outcomes/windows.ts`'s `pickBaselineWindowDays()` picks 28 days of pre-action history if that much exists, falls back to 7, or — below 7 days of history — captures nothing yet and retries on a later run rather than computing from a near-empty window. Stored in `seo_actions.baseline_*`, never overwritten once `baseline_captured_at` is set.

### Post-action measurement

`lib/outcomes/windows.ts`'s `dueMeasurementWindows()` checks all four spec-defined windows (7/14/28/56 days) against `now - executed_at`, computing (and upserting) a `seo_action_outcomes` row for every window that has actually elapsed — never before. Metrics come from real `search_console_metrics` rows (`lib/db/search-console.ts`'s `listSearchConsoleMetricsForSubjectInRange`, matched by the action's `target_url` and/or `target_keyword_text`), aggregated by `lib/outcomes/aggregate.ts` exactly like `lib/search-performance/comparison.ts` already does (impressions-weighted average position, CTR recomputed from totals — never averaged from stored per-row values).

### Outcome metrics and classification

`lib/outcomes/deltas.ts` computes clicks/impressions/CTR/position changes — `positionChange = baseline.position - current.position`, so **positive means improvement** (14 → 9 yields +5), matching the spec's explicit "lower position number = improvement" rule exactly. `lib/outcomes/classify.ts` first applies a deterministic minimum-data gate (`assessDataSufficiency` — below `MIN_IMPRESSIONS_FOR_COMPARISON` in either period, or in the new-page's own period, is `INSUFFICIENT_DATA`, full stop, never overridable by AI) and only then classifies: clicks/impressions/position are each independently checked against a "meaningful movement" threshold, and `POSITIVE`/`NEGATIVE` require every meaningfully-moved metric to agree — any real disagreement (clicks up, position down) is `MIXED`, never auto-`POSITIVE` from one improving number.

### New-page lifecycle

`lib/outcomes/lifecycle.ts` stages a `CREATE_NEW_PAGE` action's outcome as `NEW` → `DISCOVERED` → `VISIBLE` → `GROWING` → `STABLE` → `DECLINING`. `VISIBLE` only ever means "Search Console has recorded impressions for this URL" — evidence of visibility, never a claim about Google's indexing status or crawl mechanics, which this platform has no way to observe. `GROWING`/`DECLINING` compare the current measurement window against the *previous* measurement window (not the pre-action baseline), so a page that's already succeeding doesn't get relabeled "declining" just because its initial growth spurt levelled off into `STABLE`.

### The Next Action Engine

`lib/outcomes/recommend.ts` maps a classification onto exactly one of `MONITOR`/`INVESTIGATE_CTR`/`DIAGNOSE_DECLINE`/`WAIT_FOR_MORE_DATA` — `POSITIVE` always recommends `MONITOR` (never automatically keep changing a page that's working), `INCONCLUSIVE`/`INSUFFICIENT_DATA` always recommend `WAIT_FOR_MORE_DATA` (never modify the page), and `MIXED` recommends `INVESTIGATE_CTR` specifically when clicks rose but CTR fell — the spec's own example, verified in `recommend.test.ts`. `lib/outcomes/follow-up.ts`'s `shouldCreateFollowUpTask()` is the pure gate deciding whether that recommendation becomes a real task: only `INVESTIGATE_CTR`/`DIAGNOSE_DECLINE` ever do (`MONITOR`/`WAIT_FOR_MORE_DATA` never create one), only when the website's autonomy level allows recommendations, and only once per outcome — `seo_action_outcomes.follow_up_task_id` is the duplicate-prevention record, checked before every attempt.

### Autonomy levels

`websites.autonomy_level` (`MANUAL`/`AI_RECOMMENDS`[default]/`AI_PREPARES`/`AI_EXECUTES`) is schema-ready for all four, configurable per website on the Outcomes admin page. Phase 6 enforces exactly one rule regardless of level, via `lib/outcomes/autonomy.ts`'s `autonomyAllowsAutomaticContentChange()`, which **always returns `false`** — a deliberate fail-closed primitive so even a future caller that forgets to gate a content mutation on it doesn't accidentally get one. `MANUAL` additionally disables passive follow-up-task creation entirely (`autonomyAllowsRecommendations()`); every other level allows recommendations but none allow skipping human approval for an actual content change — that gate is unconditional and lives independently of the autonomy level.

### Closed-loop task creation

Follow-up tasks are created through the *existing* `seo_opportunities`/`seo_tasks` system (`insertOpportunity`/`insertTask`, same functions every earlier phase's promotion step uses) — never a parallel task system. `DIAGNOSE_DECLINE` maps onto the existing `INVESTIGATE_DECLINE` opportunity type, `INVESTIGATE_CTR` onto the existing `IMPROVE_CTR` type. Traceability (`ORIGINAL OPPORTUNITY → ORIGINAL TASK → ACTION → PUBLICATION → MEASUREMENT → OUTCOME → FOLLOW-UP TASK`) is carried through `seo_actions.seo_opportunity_id`/`seo_task_id` and the new opportunity's `priority_components` jsonb (`{ source: "action_outcome_followup", seo_action_id, seo_action_outcome_id, ... }`), same "signals snapshot" convention `search-performance-shared.ts` already established.

### Experimental tracking foundation

`seo_actions.hypothesis`/`expected_outcome`/`measurement_window_days`/`conclusion` are nullable columns, unpopulated by any default flow in this phase — laying a clean model for a future real experiment-authoring UI without building A/B testing now (explicitly out of scope per spec). No causal conclusion is ever drawn from ordinary before/after data by this phase's own code, experiment or not.

### AI interpretation

Runs strictly after every deterministic calculation above, same "TypeScript calculates, AI interprets" principle as Phase 2D — `lib/ai/prompts/action-outcomes.ts` + `actionOutcomeInterpretationSchema` (`lib/ai/schemas.ts`) has no field for a metric, no field that could restate or override `classification`/`recommendation`, and an explicit instruction never to claim causality or invent competitor activity. Bounded to `MAX_AI_INTERPRETATIONS_PER_RUN` (10) not-yet-interpreted outcomes per run (`lib/db/seo-action-outcomes.ts`'s `listUnanalysedOutcomesForWebsite`), same cost-control pattern as every prior AI-interpretation pass; a failed/skipped call never blocks measurement, alerting, or follow-up task creation, all of which already happened deterministically before it runs.

### Alerts

`lib/outcomes/alerts.ts`'s `evaluateAlertCandidates()` only ever returns a candidate when a configurable threshold is actually crossed (significant ranking/traffic decline, a strong positive result, a new page crossing an impressions-traction threshold) — ordinary movements produce nothing. Deduplicated at the DB layer via a unique index on `(seo_action_outcome_id, alert_type)`, so re-running analysis never spams the same alert twice. `NEW_HIGH_VALUE_KEYWORD` is a valid `seo_alert_type` but is **not yet evaluated** — it belongs to Phase 2D's `EMERGING_KEYWORD` detector, a different signal than an executed action's outcome, and wiring it up with an honest heuristic (rather than a shaky guess) is flagged below rather than approximated now.

### `ANALYSE_ACTION_OUTCOMES`

A new job type on its own independent per-website schedule (`next_action_outcomes_at`/`action_outcomes_frequency_days`, default daily — cheap to run when nothing is due, since the job is a no-op in that case) rather than chained off `SEARCH_CONSOLE_SYNC`, because a website can have `EXECUTED` actions worth re-checking on any given day regardless of whether a sync or publish just happened. `lib/jobs/handlers/analyse-action-outcomes.ts` orchestrates baseline capture → per-window measurement → alert evaluation → follow-up task creation → the bounded AI-interpretation pass, in that order, entirely asynchronously (never in a browser request). Manually triggerable via the Outcomes admin page or `POST /api/websites/<website-id>/action-outcomes-analysis`.

### Dashboard

`/admin/websites/[id]/outcomes` — an overview (organic clicks/impressions/average position, actions executed, positive outcomes, actions needing attention, pages improving/declining), an open-alerts table with an Acknowledge action, a per-action outcomes table (target, baseline, current, change, classification, data-sufficiency, recommendation, AI interpretation), a new-page lifecycle table, and the website's autonomy-level control — all read-only server components + plain server actions, consistent with every other admin page; no redesign.

### Security

Every new route (`/api/websites/[id]/action-outcomes-analysis`) is covered automatically by `proxy.ts`'s existing path-prefix Basic Auth (no route-specific change needed — verified, not assumed). All three new tables carry `organization_id` and RLS via the same `is_org_member()` policy as every other tenant table. Every DB read/write in `lib/db/seo-actions.ts`/`seo-action-outcomes.ts`/`seo-alerts.ts` is scoped by a server-derived `website_id`, never a client-supplied one. Every measured metric comes from stored `search_console_metrics` rows — nothing in the browser can influence a classification or a metric value.

### Testing

`lib/outcomes/*.test.ts` — 62 tests covering baseline-window selection, measurement-window due-checks, metric aggregation, position-improvement direction (14→9 positive, 9→14 negative), CTR-decline-while-clicks-rise (the MIXED case), insufficient-data gating, mixed/positive/negative/inconclusive classification, new-page lifecycle transitions, action-type traceability derivation, autonomy-level enforcement, and duplicate-follow-up-task prevention. Synthetic fixtures only — no live Search Console/AI calls, same convention as every existing test file.

### Testing the loop end-to-end

Requires at least one `PUBLISHED` content version (Phase 5) or a `completed` non-content task, and some Search Console history (Phase 2C). Via the admin UI: open a website's Outcomes page (`/admin/websites/[id]/outcomes`) and click **Run outcome analysis**. Via the API:

```bash
curl -X POST http://localhost:3000/api/websites/<website-id>/action-outcomes-analysis -u admin:$ADMIN_PASSWORD
```

Re-run it twice to confirm no duplicate `seo_action_outcomes` rows, no duplicate alerts, and no duplicate follow-up tasks.

## GitHub/Vercel Publishing Provider (Phase 6A)

A second `PublishingProvider` implementation for code-based sites deployed via GitHub → Vercel — specifically CV Central, whose actual deployment model is GitHub-backed, not WordPress. The rule that shapes every design decision in this phase, mirroring Phase 5's own: **there is no path from a pull request to a live production page without an explicit `MERGE_TO_PRODUCTION` action**, re-validated server-side on every attempt.

### Before writing any integration code

Same check Phase 4 ran for CV Central's content-generation system, re-run for its repository: no code, no deployed API, no credentials in `.env.local`/`.env.example`, no sibling repository anywhere on the machine. CV Central has only ever been a client *website* row in this database. `GitHubPublishingProvider`'s content adapter is therefore `ConfigurableMarkdownContentAdapter` — a generic, configuration-driven implementation, not a hard-coded CV Central one — see "The content adapter" below for exactly what real CV Central integration still needs supplied.

### Architecture: GitHub is the publishing source, Vercel is the deployment platform

```
SEO platform → GitHub API → branch → commit(s) → pull request → Vercel preview (auto-deployed by GitHub) → human review → MERGE_TO_PRODUCTION → Vercel production deployment (auto-deployed by GitHub) → live URL
```

No `VercelPublishingProvider` exists — there is no Vercel-specific operation this phase needs that GitHub's own APIs can't already answer. `lib/publishing/github/client.ts`'s `getDeploymentSignal()` detects a Vercel preview URL from GitHub's own commit Statuses/Checks APIs (Vercel's GitHub integration posts one automatically) — **zero Vercel API calls, zero Vercel credentials required**. `cms_connections.vercel_project_id` exists in the schema for a future `VercelDeploymentProvider` if one ever becomes genuinely necessary (e.g. more precise production-deployment-status polling), but is unused today.

### `GitHubPublishingProvider`

`lib/publishing/github/provider.ts` implements the same `PublishingProvider` interface `WordPressPublishingProvider` does (`lib/publishing/get-provider.ts`'s factory returns either, uniformly) — but the *meaning* of two methods is deliberately reinterpreted for a git-based flow, exactly per spec:

- **`createDraft(input)`** → branch + commit + pull request. Never live — the same guarantee WordPress's `createDraft` makes (never publicly visible), implemented as "a PR isn't merged" instead of "a page's status isn't `publish`". Reused as `CREATE_DRAFT`, the *same job type* WordPress uses (`lib/jobs/handlers/create-draft.ts` gained one delegating branch at its very top; every line of WordPress logic below it is untouched).
- **`publish(input, existingExternalId)`** → merges an *already-open* pull request (`existingExternalId` = the PR number, mandatory — there is no path where `publish()` creates a PR and merges it in one call). Reachable **only** from the new `MERGE_TO_PRODUCTION` job type, never from `CREATE_DRAFT`, regardless of the connection's configured `publication_mode`.
- **`getPublicationStatus(externalId)`** (new, optional interface member — WordPress doesn't implement it) — merged state + best-effort deployment signal.
- **`findBySlug`** — a documented no-op for GitHub: the real per-repository collision guard is the content adapter's own "a file already exists at the computed path" check (more precise than a synthetic slug lookup), and the real *idempotency* guard (spec's actual concern) is the branch/PR-reuse logic below, not this method.
- **`unpublish`** — throws a clear, documented error. "Do not build automatic rollback" (spec) — a future rollback system reverts via a new PR against real Git history, it doesn't call this.

### Publication modes

`GITHUB_BRANCH_ONLY` / `GITHUB_PULL_REQUEST` (default, production-safety) / `GITHUB_MERGE` — stored per-connection (`cms_connections.github_publication_mode`), schema-ready for all three. **Honestly scoped**: only `GITHUB_PULL_REQUEST`'s behavior is actually implemented differently in this phase (`createDraft` always opens a PR unless the mode is `GITHUB_BRANCH_ONLY`, in which case it stops after the commit). `GITHUB_MERGE` is an accepted, valid config value but does **not** cause automatic merging today — `MERGE_TO_PRODUCTION` is always a separate, explicit, human-triggered job regardless of mode, satisfying the spec's own "do NOT build automatic merging" instruction even though the mode exists for a future phase to wire up.

### Idempotency — "the same approved content version should not produce duplicate pages"

`lib/publishing/github/retry-strategy.ts` — three pure decision functions (`decideBranchAction`/`decidePullRequestAction`/`decideMergeAction`), unit-tested, mirroring `lib/publishing/retry-strategy.ts`'s `decidePublishAction` exactly:

- **Branch**: `computeBranchName(contentVersionId)` is deterministic (`seo-platform/{content_version_id}`) — a retry after a timeout always computes the *same* candidate name, so "does this already exist" is a meaningful live check. A known `branch_name` from `content_publications` always wins; otherwise GitHub is asked directly before ever creating one.
- **Pull request**: same shape — a known `pull_request_number` wins; otherwise `findPullRequestsForBranch` checks live GitHub state before creating a second one.
- **Merge**: `decideMergeAction` refuses to merge twice (`ALREADY_MERGED` short-circuits to a success return, no second API call), refuses to merge a PR GitHub has flagged as closed-without-merging or explicitly unmergeable (`BLOCKED` — needs human resolution), and treats "GitHub hasn't finished computing mergeability yet" (`mergeable: null`) as a real, retryable, non-error state rather than a failure.

A GitHub-flavoured error taxonomy backs this: `lib/publishing/github/errors.ts`'s `mapGitHubError` classifies 401/403-without-rate-limit-signal as permanent `AUTH`, 403-with-rate-limit-signal (GitHub overloads 403 for both) and 429/5xx as retryable, 404 as permanent `NOT_FOUND`, and 405/409/422 (GitHub's actual "already exists"/"not mergeable" status codes — not WordPress's 409) as permanent `CONFLICT`/`VALIDATION`, letting the retry-strategy layer decide what "already exists" means rather than blindly retrying into a duplicate.

### The content adapter

The critical boundary the spec calls out by name — `GitHubPublishingProvider` never assumes "create `article.md`" or "create `page.tsx`"; different code-based sites represent content completely differently. Which adapter a connection uses is a **configuration choice** (`cms_connections.content_adapter`, migration 0025), picked by the admin when connecting a repository — never hard-coded by owner/repo inside the provider.

```
GitHubPublishingProvider
        |
        v
WebsiteContentAdapter  (lib/publishing/github/content-adapter.ts)
        |
        +--> ConfigurableMarkdownContentAdapter  (lib/publishing/github/markdown-adapter.ts) -- generic default
        |
        +--> CvCentralContentAdapter  (lib/publishing/github/cvcentral-adapter.ts) -- the real CV Central site
```

`filePathsToRead()`/`planFileChanges()`/`validateFileChange()` — the middle function is pure (no GitHub calls; the provider does the reading via `GitHubClient.getFileContent` and hands the results in), so file-change planning is fully unit-testable without a repository.

**`CvCentralContentAdapter`** — built by directly, read-only inspecting `github.com/rhmatiqur-commits/cvcentral` (no changes made to that repository). Confirmed findings that shape it:

- **No framework, no build step.** Every page is a hand-authored, fully self-contained static `.html` file, deployed as-is by Vercel — `package.json` has no SSG dependency at all.
- **Two structurally different page families**: blog posts (`blog/*.html` — rich metadata: canonical/OG/Twitter/`schema.org/Article` JSON-LD) and tool/app pages (root `*.html` — sparser metadata, external stylesheets, app-like body). Only blog posts have a consistent, splice-able shape.
- **Nav and footer are duplicated inline in every single file** — no shared partial/include/templating system of any kind. This is why the adapter *clones a real, currently-published post* (`templatePostPath`, configurable) for a new page rather than generating a full document from scratch — every byte outside the identified splice regions (nav, footer, the post's own `<style>` block, the theme-toggle script) is copied verbatim, never reinvented.
- **URLs include the `.html` extension** (confirmed via a real post's own canonical tag) — no clean-URL rewrite is configured.
- **A new post is only internally discoverable if `blog/index.html` also gains a matching `<a class="post-card">` entry** — creating the post file alone produces an orphan page. `CREATE_NEW_PAGE` is therefore always a two-file change: the new post + an updated `blog/index.html` (new card inserted at the top, newest-first).
- **Zero `<img>` tags found in any of the 6 blog posts inspected** — article bodies are text-only, so image handling isn't exercised by the adapter (not implemented, same honest gap as Phase 5's WordPress featured-image limitation).
- **Neither `sitemap.xml` nor `robots.txt` exists in the repository** — flagged, not fixed by this adapter.
- Two pre-existing, unrelated issues observed (not touched): `blog/index.html` links to two posts that don't exist in the repo (`...your-niche-keyword-2026.html`, `...content-marketing-2026.html` — likely leftover template cards), and three homepage variants are committed (`index.html`/`index-full.html`/`index-legacy.html`).

Splicing is done via small, individually-tested, anchor-based string replacements — `<title>`, `<meta name="description">`, `og:title`/`og:description`/`og:url`, `<link rel="canonical">`, the JSON-LD block (parsed/patched/re-serialized as real JSON, not regex-on-JSON), `h1.article-title`, the breadcrumb's title segment, `.article-meta` (author/date/read-time), and `.article-body` — never a full-document regeneration or a general HTML parser dependency. Body content reuses `lib/publishing/markdown.ts`'s existing `markdownToHtml()` unchanged (its `h2`/`h3`/`p`/`ol`/`li` output already matches the real posts' structure exactly). `OPTIMISE_EXISTING_PAGE`:
- Is refused (`ContentAdapterError`) for anything outside `blog/*.html` — tool pages are out of scope for automated patching in this phase, per instruction, rather than guessed at.
- Never touches canonical/`og:url` (a page's URL never changes on update, same rule `lib/publishing/url.ts` already enforces for WordPress) or the original `datePublished`/publish-date span — only the read-time estimate, title, description, and body are refreshed.
- Best-effort patches the post's own card in `blog/index.html` if one is found there; never fails the whole change if it isn't (the new-page card, by contrast, is a hard requirement — a brand-new page must never ship as an orphan).

`ConfigurableMarkdownContentAdapter` remains the default for any other GitHub-connected site (config: `contentDirectory`/`fileExtension`/`routeStrategy`/`frontmatterFields` — see `lib/publishing/github/markdown-adapter.ts`'s own doc comments) — CV Central is the first, not the only, real integration this architecture supports.

### GitHub authentication

A repository-scoped Personal Access Token (`lib/publishing/github/auth.ts`'s `PersonalAccessTokenAuth`), stored through the *same* Supabase Vault `cms_credential_*` RPCs Phase 5 built for WordPress's Application Password — "extend the existing CMS/publishing connection architecture," not a second credential system. A GitHub App (the spec's preferred mechanism) is explicitly deferred: it needs App registration, a private key, an installation flow, and webhook handling, none of which exist anywhere in this repo, and the spec allows a scoped token when a full App is "too large for this phase." `GitHubAppAuth` exists as a real, typed placeholder behind the same `GitHubAuthStrategy` interface (throws a clear "not implemented" error if ever selected) — not a TODO with no shape, so a future phase has a real second branch to fill in.

### Connection setup

Extends the *same* `cms_connections` table (`provider` enum gained `'github'`; `base_url`/`username` made nullable — WordPress-only concepts). Two-step flow, mirroring Search Console's own `pending_site_selection` pattern exactly: **1)** save the token (`connectGitHubTokenAction` → `pending_repo_selection`), **2)** the Publishing admin page's `RepoPicker` lists accessible repositories *live* from the GitHub API during render (never a manually-typed URL, per spec) and the admin picks one + production branch + publication mode + **content adapter** (`selectGitHubRepositoryAction` → `pending`), **3)** an explicit **Test Connection** click (reusing `testCmsConnectionAction`, now provider-aware via `lib/publishing/get-provider.ts`'s `buildPublishingConnectionConfig`) moves it to `active`. The token is decrypted server-side only — inside the `RepoPicker` server component during render, never sent to the browser, never logged.

### `MERGE_TO_PRODUCTION`

A new, distinct job type (not a reuse of `PUBLISH_CONTENT`, which stays WordPress-only and untouched) — `lib/jobs/handlers/merge-to-production.ts`. Re-runs every check `loadAndValidatePublishingContext` already performs (content `APPROVED`, website/organization ownership, connection `active`) from the database on every attempt, refuses outright if the connection isn't GitHub or no pull request exists yet, and delegates the actual merge safety (branch/PR existence, mergeability) to the provider's own live-checked `decideMergeAction`. On success, records `production_commit_sha` and — critically — calls the *exact same* `recordSeoActionForPublication` hook `publish-content.ts`'s WordPress path calls, unmodified: `content_publications`/`seo_actions` were already provider-agnostic (verified by grep — no `"wordpress"` string appears anywhere in `lib/outcomes/*` or the Phase 6 job handlers), so Phase 6's outcome-measurement loop works for a GitHub-merged page with zero additional code. Manually triggerable via the content brief page's **Merge to Production** button (only enabled once a pull request exists) or `POST /api/content-versions/<version-id>/merge-to-production`.

### Security

Every new route/action re-derives `organization_id`/`website_id` from the resource itself (`assertWebsiteBelongsToOrganization`/`assertOwnedByOrganization`), never trusts a client-supplied value — `connectGitHubTokenAction` and `mergeToProductionAction` (via the reused `loadApprovedPublicationTarget`) both do this explicitly; `selectGitHubRepositoryAction` follows the same no-org-hint pattern every other simple per-website setting update in this codebase already uses (`updateSerpLocationAction`, `updateTaskStatusAction`, etc. — the accepted, documented single-shared-operator-credential model, see `SECURITY_AUDIT.md`). The new API route is covered automatically by `proxy.ts`'s existing path-prefix Basic Auth. The GitHub token is never returned in any JSON response, never included in a thrown error message (`GitHubApiError` messages are built only from GitHub's own response body and status code), and `lib/publishing/connection-view.ts`'s `toPublicConnection` only ever exposes `github_owner`/`repo`/`production_branch`/`account_login` (all non-sensitive, display-only) — never `credential_secret_id`, verified by a dedicated test.

### Testing

`lib/publishing/github/*.test.ts` — 105 tests: `errors.test.ts` (GitHub's actual status-code behaviour, including the 403-overload and the 422/405 "already exists"/"not mergeable" cases), `client.test.ts` (mocked `fetch`, mirroring `wordpress-provider.test.ts`'s style — auth header construction, base64 encode/decode round-trips, 404→null patterns, rate-limit header detection, Vercel-preview detection from both Statuses and Checks APIs, and that a network failure never leaks the token), `retry-strategy.test.ts` (every branch/PR/merge idempotency decision), `frontmatter.test.ts` and `markdown-adapter.test.ts` (parsing/serialization round-trips, patch-preserves-unrelated-fields, collision/missing-file refusals, path-traversal/validation checks), and `cvcentral-adapter.test.ts` (splice correctness against structurally-faithful fixtures, JSON-LD round-trip, canonical/publish-date preservation on optimise, orphan-page prevention, tool-page refusal, missing-template/missing-index refusals). No live GitHub or Vercel calls anywhere.

### Testing the pipeline

Admin UI: connect a repository on a website's Publishing page (`/admin/websites/[id]/publishing`) with a GitHub Personal Access Token, pick the repository/branch from the live-listed set, **Test Connection**. On an approved content brief's page, the Publishing section shows **Prepare Publication (branch + PR)** and **Merge to Production** (disabled until a PR exists) instead of WordPress's Create Draft/Publish, plus the branch name, PR link, and preview URL once available. Via the API:

```bash
curl -X POST http://localhost:3000/api/content-versions/<version-id>/merge-to-production -u admin:$ADMIN_PASSWORD
```

## Multi-Tenant Client Portal (Phase 7)

Turns the platform from an internal tool into a real SaaS: a client logs in with their own email/password and sees only their own organisation's SEO operation, never another client's — enforced both server-side (an explicit membership check before any privileged query) and by Postgres RLS (verified live, not just asserted). `/admin/**` is completely untouched — same `ADMIN_PASSWORD` Basic Auth, same code, same behaviour before and after this phase.

### What already existed (found during inspection, not rebuilt)

Before writing a single line of Phase 7 code, the existing architecture was inspected end to end: `organizations`/`memberships` tables, an `is_org_member(organization_id)` Postgres function checking `memberships.user_id = auth.uid()`, and an RLS policy using it on **every one of the 35 tenant tables that existed at the time** (confirmed by querying `pg_policies` directly against the live project) — all built in Phase 1, never exercised, because every request before this phase went through the service-role key. `websites.organization_id` already gives the full ownership chain the spec asked to use instead of stamping `organization_id` on every child table. CV Central's data was already in its own organisation (seeded in Phase 1, used as the test client throughout Phases 2–6A). None of this was rebuilt — Phase 7's actual work was making a real session exist and building the client surface on top of what was already there.

### Authentication

`@supabase/ssr` — `lib/supabase/server-session.ts`'s `createSessionClient()` is a request-scoped (cookie-bound, built fresh per render — never cached like `supabaseAdmin()`) client using the anon key, safe to ship to the browser by Supabase's own convention precisely because RLS, not secrecy of that key, is what protects tenant data behind it. `proxy.ts` gates `/dashboard/**` with a separate branch from `/admin/**`'s Basic Auth check — refreshes the session cookie (the standard `@supabase/ssr` middleware pattern) and redirects to `/dashboard/login` when there's no valid user, using `auth.getUser()` (revalidates the JWT against the Auth server) never `auth.getSession()` (only reads the local cookie, unverified — not safe to gate access on). Every dashboard page independently calls `lib/auth/session.ts`'s `requireOrganizationMembership()` too, rather than trusting the middleware alone — the same "each page loads its own data, doesn't trust a shared context" convention `/admin` already uses.

Login/logout/password-reset are all plain HTML forms posting to Server Actions (`app/dashboard/auth-actions.ts`) — no client-side JS framework, consistent with the rest of this codebase. Password reset uses Supabase's PKCE flow: the emailed link lands on `/dashboard/reset-password?code=...`, which exchanges the code for a short-lived recovery session server-side (in the page's own render, before anything is displayed) before showing the "set a new password" form.

### Organisations, roles, and permissions

`memberships.role` is now `OWNER`/`MANAGER`/`EDITOR`/`VIEWER` (migration `0026`) — the exact permission table from the spec, implemented as small named pure functions in `lib/auth/permissions.ts` (`canApproveContent`, `canPreparePublication`, `canPublishToProduction`, `canManageIntegrations`, `canManageUsers`, `canEditContent`, ...), unit-tested directly (no DB, no session — same "pure function first" convention as `lib/outcomes/autonomy.ts`). `EDITOR` cannot publish to production by default ("only if explicitly permitted" — no per-user override mechanism exists yet, so the safe default is `MANAGER`+ only). Hiding a button for a role that can't use it is a UX nicety only, never the security boundary — every Server Action re-derives the caller's actual role from their session and calls the same permission function again before mutating anything.

`lib/auth/session.ts`'s `requireOrganizationMembership(orgSlug, minRole?)` is the one function every dashboard page and Server Action calls: resolves the real organisation from the URL's `orgSlug` (routes are `/dashboard/[orgSlug]/...`), then asserts — via an explicit `user_id`+`organization_id` database query (`lib/db/memberships.ts`'s `getMembershipForUser`), never inferred from the URL itself — that the signed-in user actually belongs to it. A slug that doesn't resolve to a membership returns a plain 404, deliberately indistinguishable from "this organisation doesn't exist," so a signed-in user can't use this page to enumerate other organisations' slugs.

### How data access is actually enforced (read this before assuming "RLS enforces everything")

Two layers, honestly described rather than overclaimed:

1. **The primary, mandatory gate**: every dashboard page/action calls `requireOrganizationMembership()` (or, for Server Actions mutating a specific resource, additionally `lib/api/authorize.ts`'s `assertOwnedByOrganization` — the exact same IDOR guard `/admin`'s own actions and every `/api/**` route already use, here even stronger since the "expected" organisation id comes from a verified session+membership rather than a merely client-supplied hidden field being cross-checked). This is the boundary that actually runs on every request.
2. **RLS as a structural backstop, not this app's primary enforcement path**: the dashboard's own data *reads* go through the same service-role `lib/db/*` functions `/admin` uses (scoped by the already-verified `organization.id`/`website.id`) — not a parallel RLS-scoped query layer for every list page. That's a deliberate simplicity/consistency trade-off, not an oversight: it means *this app's own request path* relies on layer 1, same trust model `/admin` has always had. RLS's real, verified value is that it protects the data at the database level regardless of what queries it — including a future mobile app, a different backend, or a bug in layer 1 that this app's own code never exercises. `createSessionClient()` (the actual RLS-respecting client) is used for what it's actually needed for: authentication itself (`signInWithPassword`/`signOut`/`getUser`/`updateUser`/`exchangeCodeForSession`).

### Live cross-tenant RLS verification (not just asserted — run against the real database)

A throwaway second organisation and a throwaway real Supabase Auth user were created, signed in with the **anon key** (not service-role — the only way to actually exercise RLS), and used to attempt 20 separate reads against CV Central's real data: `websites` (by id and by `organization_id`, filtered and unfiltered), `seo_opportunities`, `seo_tasks`, `content_briefs`, `content_versions`, `content_publications`, `publication_audit_log`, `cms_connections`, `search_console_connections`, `search_console_metrics`, `keywords`, `seo_actions`, `seo_action_outcomes`, `seo_alerts`, `competitor_domains`, another organisation's `memberships` rows, and `organization_invitations`. **Every single one returned zero rows** — no error, RLS silently filtered them, exactly the correct behaviour. A positive control (the same session reading its own throwaway organisation's own membership row) confirmed the client wasn't simply broken — it returned exactly one row. The throwaway organisation/user/membership were deleted immediately after.

### The `/dashboard/[orgSlug]/**` surface

`/dashboard` on its own resolves to the signed-in user's organisation (redirecting straight there when there's exactly one — the common case today) or offers a picker when there's more than one; every real page lives under `/dashboard/[orgSlug]/`. Every organisation in this platform has exactly one website today (CV Central, Voltvid) — `lib/dashboard/website.ts`'s `getPrimaryWebsiteForOrganization()` resolves "the" website per organisation rather than building a website-switcher for a multi-website-per-org case that doesn't exist yet; flagged below as a placeholder decision, not permanent.

- **Overview** (`/dashboard/[org]`) — organic clicks/impressions/CTR/average position, active opportunities, pending approvals, issues needing attention, recent publications, outcome summary, open alerts.
- **Opportunities** — Accept (marks approved, creates the linked `seo_tasks` row if one doesn't already exist — idempotent) / Dismiss, `MANAGER`+. Internal `priority_score` is translated into a Low/Medium/High "impact" badge, never the raw number.
- **Tasks** — status changes (`MANAGER`+); marking one `completed` runs the exact same Phase 6 `recordSeoActionForCompletedTask` hook `/admin` uses.
- **Content** — brief list, per-brief review (generated draft, QA result in plain language), Generate/Request changes (`EDITOR`+), Approve/Reject (`MANAGER`+ only — the one action in this whole surface with the highest stakes), and the same Prepare Publication/Approve & Publish to Production flow described below.
- **Publishing** — every publication for the website, branch/PR/preview/live links, status.
- **Outcomes** — Phase 6 in plain language ("Improved"/"Declined"/"Mixed result"/"Still gathering data" instead of the raw enum), the same non-causal, cautious framing (`lib/outcomes/*`) reused as-is — no second measurement system.
- **SEO Audit** — open issues, filterable by severity.
- **Search Console** — real Google data, explicitly labelled as such.
- **Keywords**, **Competitors** — client-relevant subset of what `/admin` already computes; DataForSEO costs, `provider_usage`, and raw internal debug data are never surfaced.
- **Reports** — a from-existing-data performance report (current vs. previous 28-day window, actions completed/successful/still-measuring/needing-attention, technical health) — no new reporting database, computed from `search_console_metrics`/`seo_actions`/`seo_action_outcomes`/`seo_issues`/`seo_opportunities` the same way the other pages already read them.
- **Settings** — website info; Search Console/publishing connection status (`OWNER` can reconnect/update the GitHub token and pick a repository — a simpler manual owner/repo/branch form than `/admin`'s live-listed repository picker, a scope reduction flagged below rather than hidden); team list with role management and an invite form (`OWNER` only).

### Publishing workflow (identical safety guarantees to Phase 6A, now client-facing)

`APPROVED content → Prepare publication (branch + commit + PR, GitHub; draft, WordPress) → Vercel preview → client reviews → explicit Approve & Publish to Production → merge → live URL`. "Prepare publication" and "Approve & Publish to Production" are `MANAGER`+ only and are two genuinely distinct Server Actions (`preparePublicationAction`/`approveProductionMergeAction`) calling the exact same `CREATE_DRAFT`/`MERGE_TO_PRODUCTION`(or `PUBLISH_CONTENT` for WordPress) job types Phase 5/6A built — never a new publishing code path, and every server-side re-check (content actually `APPROVED`, connection active, PR exists/mergeable) still happens in the job handler against live database/GitHub state, exactly as before.

### User invitations

`OWNER`/`MANAGER` invites an email to a role (`app/dashboard/actions.ts`'s `inviteMemberAction`, `MANAGER`+ — though only `OWNER` can reach the Settings team UI that surfaces it, per `canManageUsers`). `/dashboard/accept-invite?token=...` looks up the invitation server-side by its unguessable `token` and: if already signed in as the invited email, one click creates the membership; if signed in as someone else, refuses with a clear message; if not signed in and an account already exists for that email, links to login (then auto-completes on return); if no account exists, lets them set a password, creates the Supabase Auth user (`email_confirm: true` — the invitation link itself, sent only to that address, is what proves email ownership here) and the membership together, then signs them straight in. The organisation id and role **always** come from the invitation row, never from anything the browser submits at any step.

### Security audit — every `/api/**` route classified

| Classification | Routes | Notes |
|---|---|---|
| **ADMIN-ONLY** (Basic Auth) | All 20 `/api/websites/**`, `/api/tasks/**`, `/api/jobs/**`, `/api/organizations/**`, `/api/content-briefs/**`, `/api/content-versions/**` routes | Unchanged by Phase 7 — the dashboard never calls any of these; it reads via Server Components and writes via its own Server Actions instead, keeping this entire surface exactly as audited in Phase 2D. |
| **INTERNAL/SCHEDULER** | `/api/scheduler/run` | Unchanged — `CRON_SECRET` bearer, checked in-handler. |
| **OAUTH CALLBACK** | `/api/auth/google-search-console/callback` | Unchanged — signed, expiring `state` param. |
| **ORGANISATION-SCOPED** | *(none)* | Deliberately zero new `/api/**` routes for the client portal — smaller audit surface. `/dashboard/**` reads/writes go through Next.js Server Components/Server Actions instead, gated by `requireOrganizationMembership()` + RLS, not a parallel authenticated-API surface that would need its own independent audit. |

No route needed to change. Specifically verified: a signed-in user cannot read another organisation's website/opportunities/content/Search Console connection/GitHub connection (live RLS probe, above); cannot approve or publish another organisation's content (`assertOwnedByOrganization` throws — same guard already unit-tested in `lib/api/authorize.test.ts`, reused here rather than duplicated); cannot manipulate another organisation's outcomes (the dashboard has no outcome-mutation action at all — outcomes are read-only, and reads are RLS-blocked regardless).

### Testing

`lib/auth/permissions.test.ts` — 9 tests covering every role→capability rule including the legacy-label fail-closed case. Plus the live, non-`npm test` verification above (RLS cross-tenant probe, real login/logout/session-redirect browser check, `/admin` Basic Auth confirmed untouched) — synthetic-fixture unit tests can't prove "RLS actually blocks a real signed-in session," only a live database can, so that check is documented here rather than faked as a mocked unit test. 473 tests total, 0 failures; `typecheck`/`build` both clean.

### Known limitations, honestly flagged

- **One website per organisation, by convention, not by schema.** `lib/dashboard/website.ts` always resolves the *first active* website — correct for every organisation that exists today (CV Central, Voltvid), not yet a real multi-website switcher.
- **Settings' GitHub repository picker is a manual owner/repo/branch form**, not `/admin`'s live-listed-from-the-GitHub-API picker — a scope reduction for this phase, not a security gap (the same `selectGitHubRepository` DB function and `OWNER`-only gate either way).
- **Search Console connection is admin-initiated only** — the OAuth flow (`/api/auth/google-search-console/*`) isn't yet reachable from a dashboard session; Settings shows connection status read-only and directs the client to their account manager.
- **Dashboard reads go through `lib/db/*` (service-role), gated by an explicit app-layer membership check** — see "How data access is actually enforced" above. This is the same trust model `/admin` has always used, not a regression, but it means RLS is verified as a real, working backstop rather than being this specific app's own enforcement mechanism for every read.

### Demo credentials created for the success criteria

Organisation **CV Central** (already existed) + a real Supabase Auth user **`client@cvcentral.io`** with an `OWNER` membership, created via the Admin API exactly as a real onboarding would — the generated password was shared once, out of band, at the end of this phase's work; treat it as a demo credential to rotate before any real client uses this deployment.

## What remains for Phase 8+

- **`CvCentralContentAdapter` tool-page support** — `OPTIMISE_EXISTING_PAGE` is deliberately scoped to `blog/*.html` only for now; tool/app pages (`cv-builder.html` etc.) have a materially different, sparser structure and are refused rather than guessed at — see "The content adapter" above.
- **A real sitemap for CV Central** — the repository has neither `sitemap.xml` nor `robots.txt` today; not something this adapter invents or fixes.
- **`GITHUB_MERGE` mode's actual auto-merge behavior** — the config value exists and is accepted, but `MERGE_TO_PRODUCTION` is always a separate explicit action in this phase regardless of mode (see "Publication modes" above).
- **A GitHub App implementation** — `GitHubAppAuth` is a typed, documented placeholder behind `GitHubAuthStrategy`; a Personal Access Token is what's actually used today.
- **A `VercelDeploymentProvider`** if GitHub's own Statuses/Checks-based preview detection (`getDeploymentSignal`) ever proves insufficient — `cms_connections.vercel_project_id` is schema-ready but unused.
- **Image handling and a sitemap/route-manifest update step** for GitHub-based publishing — no image pipeline exists yet (same gap as Phase 5's WordPress featured-image limitation), and no adapter updates a sitemap alongside a new page.
- **Webflow, Shopify, and other `PublishingProvider` implementations** — the interface was designed for this from day one; WordPress and GitHub are the first two, not the only, implementations.
- **SEO-plugin integration** (Yoast/RankMath meta fields) — deliberately not implemented in Phase 5 (see "Metadata mapping" above); would need its own verified integration, not an assumption about which plugin a client runs.
- **A real multi-website-per-organisation dashboard** — `getPrimaryWebsiteForOrganization()` picks the first active website; every organisation has exactly one today, so this is untested for the many-websites case.
- **Client-initiated Search Console OAuth** — the flow exists (`/api/auth/google-search-console/*`) but isn't wired into a `/dashboard`-session-authenticated path yet; connecting GSC is still an admin/account-manager action.
- **A live-listed GitHub repository picker in `/dashboard` Settings** — `/admin` has one; the dashboard's is a simpler manual owner/repo/branch form for now.
- **Billing/Stripe, white-labeling, a mobile app** — explicitly out of scope for Phase 7 per spec, same as every other phase's own non-goals list.
- **Featured image/categories/tags** for publishing, once Phase 4's content system actually produces image/taxonomy data to map.
- A real `CvCentralContentProvider` (or equivalent) once an actual content-writing system/API becomes reachable — `AiContentProvider` is a deliberate placeholder behind the same interface, not a permanent choice.
- Feeding real Search Console/SERP position data into `keyword_opportunities.difficulty_score`, replacing the AI-estimated placeholder now that real ranking data exists from two sources.
- Splitting `ANALYSE_WEBSITE` into its own richer step now that real keyword and competitor data exist.
- A real worker/queue (BullMQ+Redis or similar) behind the same `jobs` table — `lib/jobs/handlers/*` only depend on the `JobHandler` signature, so this replaces `processPendingJobs`'s loop without touching them.
- Real per-tenant authorization — `/api/**` now requires the shared operator `ADMIN_PASSWORD`, but there's still no per-client isolation (see `SECURITY_AUDIT.md`'s "Deferred" section) until Supabase Auth sessions + `memberships`-scoped access replace the service-role-key-everywhere model.
- AI enrichment of `UNKNOWN`/`OTHER`-classified competitor domains (the deterministic classifier is intentionally conservative — see "Competitor identification" above).
- **A detector coverage gap found during live testing (CV Central, Phase 3)**: when the client has a page that already lexically matches a keyword, but the client doesn't rank for it *at all* (not just poorly) while `DIRECT_COMPETITOR`s do, neither `COMPETITOR_CONTENT_GAP` (skips — a matching page exists) nor `COMPETITOR_RANKING_GAP` (skips — requires the client to already hold *some* position to compare against) fires. Closing this needs a variant detector keyed off "never ranked despite adequate content" rather than "no content" or "ranks worse" — closer in spirit to `MISSING_PAGE`/`DECLINING_KEYWORD` from Phase 2D. Not built yet.
- A `raw_response`/SERP-payload retention/cleanup job (currently kept indefinitely, flagged as a follow-up).
- **Real A/B testing / experimentation**, building on Phase 6's `hypothesis`/`expected_outcome`/`measurement_window_days`/`conclusion` foundation — deliberately not built in Phase 6.
- **`NEW_HIGH_VALUE_KEYWORD` alerts**, wiring Phase 2D's `EMERGING_KEYWORD` detector into `lib/outcomes/alerts.ts` rather than approximating it from action-outcome deltas alone.
- **Competitor context in AI outcome interpretation** — `lib/ai/prompts/action-outcomes.ts`'s `competitorContext` field exists in the schema but is always sent empty in Phase 6 (no live SERP call is made for this pass, per the cost-control principle); populating it from cached `competitor_domains` data is a natural next step.
- **`AI_PREPARES`/`AI_EXECUTES` autonomy levels actually doing more than `AI_RECOMMENDS`** — the enum and the per-website setting exist (Phase 6), but no code path currently grants them additional capability; `lib/outcomes/autonomy.ts`'s `autonomyAllowsAutomaticContentChange()` always returns `false` today, by design.
- **Per-subject baseline history** — Phase 6's baseline-window selection uses the website's *overall* earliest Search Console date (matching Phase 2D's own `pickComparisonWindowDays` convention) rather than a per-keyword/per-URL earliest date, which would be more precise but costs an extra query per action; flagged as a possible refinement, not blocking.
- Backlink intelligence, ranking history trends/alerts beyond the current comparison windows, deeper competitor content analysis (topic clustering).
- A richer, more collaborative content editor (inline editing, real diffing between versions) — Phase 4 deliberately kept the review UI to read/compare/approve/reject/request-revision, per spec.
- Backlink campaigns, autonomous outreach, client-facing reports, billing, full client-authentication redesign — all explicitly out of scope so far.
