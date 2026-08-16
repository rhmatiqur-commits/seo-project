import type { JobStatus, JobType } from "@/lib/supabase/types";

/**
 * Pure, side-effect-free scheduling/retry decisions. Kept separate from
 * lib/jobs/scheduler.ts and lib/db/jobs.ts (which do the actual DB I/O) so
 * this file can be unit-tested directly with plain objects — no Supabase
 * client, no mocking, same pattern as lib/audit/rules/*.test.ts.
 */

// A PROCESSING job older than this is assumed dead (crashed process, killed
// serverless invocation, etc.) rather than genuinely still running — well
// above the crawler's own 5-minute hard cap (lib/crawler/limits.ts) and the
// AI provider calls, which normally complete in seconds.
export const STALE_PROCESSING_THRESHOLD_MS = 15 * 60 * 1000;

// Minimum time a FAILED job must sit before it's eligible to be requeued.
// This is what prevents a transient failure from being retried 3 times back
// to back within a single sweep — cheap, schema-free backoff.
export const RETRY_COOLDOWN_MS = 5 * 60 * 1000;

// Bounds on the scheduler's worker loop (lib/jobs/runner.ts
// processPendingJobs), so a single HTTP request/cron invocation can't run
// forever — it processes what it can within this budget and leaves the rest
// for the next sweep.
export const WORKER_LOOP_MAX_DURATION_MS = 4 * 60 * 1000;
export const WORKER_LOOP_MAX_ITERATIONS = 30;

export interface WebsiteScheduleInfo {
  status: "active" | "paused" | "archived";
  next_crawl_at: string | null;
}

export function isDueForCrawl(website: WebsiteScheduleInfo, now: Date): boolean {
  if (website.status !== "active") return false;
  if (!website.next_crawl_at) return true;
  return new Date(website.next_crawl_at).getTime() <= now.getTime();
}

/** A website is only enqueued for a new crawl if it's due AND no CRAWL_WEBSITE
 * job is already active for it — combines the two checks the scheduler needs
 * so both are covered by one tested decision. */
export function shouldEnqueueWebsiteCrawl(
  website: WebsiteScheduleInfo,
  existingActiveCrawlJob: unknown | null,
  now: Date
): boolean {
  return isDueForCrawl(website, now) && existingActiveCrawlJob === null;
}

export interface KeywordDiscoveryScheduleInfo {
  status: "active" | "paused" | "archived";
  next_keyword_discovery_at: string | null;
}

/** Mirrors isDueForCrawl exactly, but against the keyword-discovery cadence
 * (websites.next_keyword_discovery_at/keyword_discovery_frequency_days) —
 * its own recurring schedule, configurable per website, independent of the
 * crawl schedule (see lib/jobs/handlers/keyword-discovery.ts). */
export function isDueForKeywordDiscovery(website: KeywordDiscoveryScheduleInfo, now: Date): boolean {
  if (website.status !== "active") return false;
  if (!website.next_keyword_discovery_at) return true;
  return new Date(website.next_keyword_discovery_at).getTime() <= now.getTime();
}

export function shouldEnqueueKeywordDiscovery(
  website: KeywordDiscoveryScheduleInfo,
  existingActiveJob: unknown | null,
  now: Date
): boolean {
  return isDueForKeywordDiscovery(website, now) && existingActiveJob === null;
}

export interface SearchConsoleSyncScheduleInfo {
  status: "active" | "paused" | "archived";
  next_search_console_sync_at: string | null;
}

/** Mirrors isDueForCrawl/isDueForKeywordDiscovery, but against the Search
 * Console sync cadence (websites.next_search_console_sync_at/
 * search_console_sync_frequency_days) — its own independent recurring
 * schedule. The scheduler additionally scopes this to websites with an
 * active connection before ever calling this (see lib/jobs/scheduler.ts). */
export function isDueForSearchConsoleSync(website: SearchConsoleSyncScheduleInfo, now: Date): boolean {
  if (website.status !== "active") return false;
  if (!website.next_search_console_sync_at) return true;
  return new Date(website.next_search_console_sync_at).getTime() <= now.getTime();
}

export function shouldEnqueueSearchConsoleSync(
  website: SearchConsoleSyncScheduleInfo,
  existingActiveJob: unknown | null,
  now: Date
): boolean {
  return isDueForSearchConsoleSync(website, now) && existingActiveJob === null;
}

export interface SerpFetchScheduleInfo {
  status: "active" | "paused" | "archived";
  next_serp_fetch_at: string | null;
}

/** Mirrors isDueForCrawl/isDueForKeywordDiscovery/isDueForSearchConsoleSync,
 * but against the SERP-fetch cadence (websites.next_serp_fetch_at/
 * serp_fetch_frequency_days) — its own independent recurring schedule at the
 * website level. Per-keyword tiered cadence (HIGH/MEDIUM/LOW) is a separate,
 * finer-grained concern handled entirely in lib/serp/priority-tier.ts. */
export function isDueForSerpFetch(website: SerpFetchScheduleInfo, now: Date): boolean {
  if (website.status !== "active") return false;
  if (!website.next_serp_fetch_at) return true;
  return new Date(website.next_serp_fetch_at).getTime() <= now.getTime();
}

export function shouldEnqueueSerpFetch(website: SerpFetchScheduleInfo, existingActiveJob: unknown | null, now: Date): boolean {
  return isDueForSerpFetch(website, now) && existingActiveJob === null;
}

export interface StaleCheckJob {
  status: JobStatus;
  started_at: string | null;
}

export function isStaleProcessing(
  job: StaleCheckJob,
  now: Date,
  thresholdMs: number = STALE_PROCESSING_THRESHOLD_MS
): boolean {
  if (job.status !== "PROCESSING") return false;
  if (!job.started_at) return false;
  return now.getTime() - new Date(job.started_at).getTime() > thresholdMs;
}

export interface RetryCheckJob {
  status: JobStatus;
  retry_count: number;
  max_retries: number;
  completed_at: string | null;
}

export function isRetryEligible(
  job: RetryCheckJob,
  now: Date,
  cooldownMs: number = RETRY_COOLDOWN_MS
): boolean {
  if (job.status !== "FAILED") return false;
  if (job.retry_count >= job.max_retries) return false;
  if (!job.completed_at) return false;
  return now.getTime() - new Date(job.completed_at).getTime() >= cooldownMs;
}

/** The pipeline order: CRAWL_WEBSITE -> RUN_SEO_AUDIT -> GENERATE_SEO_OPPORTUNITIES.
 * ANALYSE_WEBSITE shares a handler with GENERATE_SEO_OPPORTUNITIES (see
 * lib/jobs/handlers/opportunities.ts) but is never auto-chained into — it
 * stays a valid, manually-triggerable job type only, same as in Phase 1. */
export function getNextJobType(jobType: JobType): JobType | null {
  switch (jobType) {
    case "CRAWL_WEBSITE":
      return "RUN_SEO_AUDIT";
    case "RUN_SEO_AUDIT":
      return "GENERATE_SEO_OPPORTUNITIES";
    case "GENERATE_SEO_OPPORTUNITIES":
    case "ANALYSE_WEBSITE":
      return null;
    case "KEYWORD_DISCOVERY":
      // Its own recurring schedule (see isDueForKeywordDiscovery above),
      // deliberately not part of the crawl -> audit -> opportunities chain.
      return null;
    case "SEARCH_CONSOLE_SYNC":
      // Its own recurring schedule (see isDueForSearchConsoleSync above) for
      // *when a sync starts*, but a completed sync does chain into analysis
      // (Phase 2D) — "run ANALYSE_SEARCH_PERFORMANCE after Search Console
      // sync where appropriate" per spec.
      return "ANALYSE_SEARCH_PERFORMANCE";
    case "ANALYSE_SEARCH_PERFORMANCE":
      // Terminal, and — like ANALYSE_WEBSITE — also independently, manually
      // triggerable (e.g. for a website with no Search Console connection at
      // all; CONTENT_GAP/INTERNAL_LINK_OPPORTUNITY don't need one).
      return null;
    case "FETCH_SERP_RESULTS":
      // Its own recurring schedule (see isDueForSerpFetch above) for *when a
      // fetch starts*, but a completed fetch chains tightly into competitor
      // analysis (Phase 3) — mirrors CRAWL_WEBSITE -> RUN_SEO_AUDIT.
      return "ANALYSE_COMPETITORS";
    case "ANALYSE_COMPETITORS":
      return "ANALYSE_COMPETITOR_GAPS";
    case "ANALYSE_COMPETITOR_GAPS":
      // Terminal — runs its own AI-interpretation/promotion pass (see
      // lib/jobs/handlers/search-performance-shared.ts) rather than chaining
      // into ANALYSE_SEARCH_PERFORMANCE, which would needlessly redo the 7
      // existing detectors on every competitor-gap run.
      return null;
    case "GENERATE_CONTENT":
    case "QA_CONTENT":
    case "REVISE_CONTENT":
      // Deliberately NOT chained through this generic, website-scoped
      // mechanism (idempotency_key = "{nextType}:{websiteId}" would collide
      // across two different content_briefs on the same website — many can
      // be in flight at once, unlike the rest of this pipeline). Each
      // content handler creates its own next stage directly, scoped by
      // content_job_id — see lib/jobs/handlers/{generate,qa,revise}-content.ts.
      return null;
    case "CREATE_DRAFT":
    case "PUBLISH_CONTENT":
      // Same reasoning as the content jobs above, one level further out:
      // many content_publications can be in flight per website at once, and
      // Create Draft / Publish are two explicit, independently human-
      // triggered actions (Phase 5), never auto-chained into each other.
      return null;
    default:
      return null;
  }
}

/** Only a COMPLETED job advances the pipeline — a FAILED job must never
 * trigger its dependent stage. */
export function shouldAdvancePipeline(status: JobStatus): boolean {
  return status === "COMPLETED";
}
