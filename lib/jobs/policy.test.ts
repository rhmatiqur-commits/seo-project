import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isDueForCrawl,
  shouldEnqueueWebsiteCrawl,
  isDueForKeywordDiscovery,
  shouldEnqueueKeywordDiscovery,
  isDueForSearchConsoleSync,
  shouldEnqueueSearchConsoleSync,
  isDueForSerpFetch,
  shouldEnqueueSerpFetch,
  isStaleProcessing,
  isRetryEligible,
  getNextJobType,
  shouldAdvancePipeline,
  STALE_PROCESSING_THRESHOLD_MS,
  RETRY_COOLDOWN_MS,
} from "./policy";

const NOW = new Date("2026-08-15T12:00:00Z");
const minutesAgo = (mins: number) => new Date(NOW.getTime() - mins * 60_000).toISOString();
const minutesFromNow = (mins: number) => new Date(NOW.getTime() + mins * 60_000).toISOString();

// --- 5. Scheduler creating only due jobs ---

test("isDueForCrawl: active website with no next_crawl_at is due (first-ever crawl)", () => {
  assert.equal(isDueForCrawl({ status: "active", next_crawl_at: null }, NOW), true);
});

test("isDueForCrawl: active website whose next_crawl_at has passed is due", () => {
  assert.equal(isDueForCrawl({ status: "active", next_crawl_at: minutesAgo(5) }, NOW), true);
});

test("isDueForCrawl: active website whose next_crawl_at is in the future is not due", () => {
  assert.equal(isDueForCrawl({ status: "active", next_crawl_at: minutesFromNow(5) }, NOW), false);
});

test("isDueForCrawl: paused website is never due regardless of next_crawl_at", () => {
  assert.equal(isDueForCrawl({ status: "paused", next_crawl_at: minutesAgo(999) }, NOW), false);
});

// --- 1 & 6. Duplicate job prevention / scheduler not creating duplicate jobs ---

test("shouldEnqueueWebsiteCrawl: due website with no active crawl job -> enqueue", () => {
  assert.equal(shouldEnqueueWebsiteCrawl({ status: "active", next_crawl_at: null }, null, NOW), true);
});

test("shouldEnqueueWebsiteCrawl: due website with an already-active crawl job -> do not enqueue", () => {
  assert.equal(shouldEnqueueWebsiteCrawl({ status: "active", next_crawl_at: null }, { id: "existing" }, NOW), false);
});

test("shouldEnqueueWebsiteCrawl: not-due website -> do not enqueue even with no active job", () => {
  assert.equal(shouldEnqueueWebsiteCrawl({ status: "active", next_crawl_at: minutesFromNow(5) }, null, NOW), false);
});

// --- 5 & 6, keyword discovery variant: its own independent schedule ---

test("isDueForKeywordDiscovery: active website with no next_keyword_discovery_at is due (first-ever run)", () => {
  assert.equal(isDueForKeywordDiscovery({ status: "active", next_keyword_discovery_at: null }, NOW), true);
});

test("isDueForKeywordDiscovery: active website whose next_keyword_discovery_at is in the future is not due", () => {
  assert.equal(isDueForKeywordDiscovery({ status: "active", next_keyword_discovery_at: minutesFromNow(5) }, NOW), false);
});

test("isDueForKeywordDiscovery: paused website is never due", () => {
  assert.equal(isDueForKeywordDiscovery({ status: "paused", next_keyword_discovery_at: minutesAgo(999) }, NOW), false);
});

test("shouldEnqueueKeywordDiscovery: due website with an already-active discovery job -> do not enqueue", () => {
  assert.equal(shouldEnqueueKeywordDiscovery({ status: "active", next_keyword_discovery_at: null }, { id: "existing" }, NOW), false);
});

test("shouldEnqueueKeywordDiscovery: due website with no active job -> enqueue", () => {
  assert.equal(shouldEnqueueKeywordDiscovery({ status: "active", next_keyword_discovery_at: null }, null, NOW), true);
});

// --- 5 & 6, search console sync variant: its own independent schedule ---

test("isDueForSearchConsoleSync: active website with no next_search_console_sync_at is due (first-ever sync)", () => {
  assert.equal(isDueForSearchConsoleSync({ status: "active", next_search_console_sync_at: null }, NOW), true);
});

test("isDueForSearchConsoleSync: active website whose next_search_console_sync_at has passed is due", () => {
  assert.equal(isDueForSearchConsoleSync({ status: "active", next_search_console_sync_at: minutesAgo(5) }, NOW), true);
});

test("isDueForSearchConsoleSync: active website whose next_search_console_sync_at is in the future is not due", () => {
  assert.equal(isDueForSearchConsoleSync({ status: "active", next_search_console_sync_at: minutesFromNow(5) }, NOW), false);
});

test("isDueForSearchConsoleSync: paused website is never due", () => {
  assert.equal(isDueForSearchConsoleSync({ status: "paused", next_search_console_sync_at: minutesAgo(999) }, NOW), false);
});

test("shouldEnqueueSearchConsoleSync: due website with an already-active sync job -> do not enqueue", () => {
  assert.equal(shouldEnqueueSearchConsoleSync({ status: "active", next_search_console_sync_at: null }, { id: "existing" }, NOW), false);
});

test("shouldEnqueueSearchConsoleSync: due website with no active job -> enqueue", () => {
  assert.equal(shouldEnqueueSearchConsoleSync({ status: "active", next_search_console_sync_at: null }, null, NOW), true);
});

// --- 5 & 6, SERP fetch variant: its own independent schedule (Phase 3) ---

test("isDueForSerpFetch: active website with no next_serp_fetch_at is due (first-ever fetch)", () => {
  assert.equal(isDueForSerpFetch({ status: "active", next_serp_fetch_at: null }, NOW), true);
});

test("isDueForSerpFetch: active website whose next_serp_fetch_at has passed is due", () => {
  assert.equal(isDueForSerpFetch({ status: "active", next_serp_fetch_at: minutesAgo(5) }, NOW), true);
});

test("isDueForSerpFetch: active website whose next_serp_fetch_at is in the future is not due", () => {
  assert.equal(isDueForSerpFetch({ status: "active", next_serp_fetch_at: minutesFromNow(5) }, NOW), false);
});

test("isDueForSerpFetch: paused website is never due", () => {
  assert.equal(isDueForSerpFetch({ status: "paused", next_serp_fetch_at: minutesAgo(999) }, NOW), false);
});

test("shouldEnqueueSerpFetch: due website with an already-active fetch job -> do not enqueue", () => {
  assert.equal(shouldEnqueueSerpFetch({ status: "active", next_serp_fetch_at: null }, { id: "existing" }, NOW), false);
});

test("shouldEnqueueSerpFetch: due website with no active job -> enqueue", () => {
  assert.equal(shouldEnqueueSerpFetch({ status: "active", next_serp_fetch_at: null }, null, NOW), true);
});

// --- 4. Stale processing-job recovery ---

test("isStaleProcessing: PROCESSING job started well past the threshold is stale", () => {
  const job = { status: "PROCESSING" as const, started_at: new Date(NOW.getTime() - STALE_PROCESSING_THRESHOLD_MS - 1000).toISOString() };
  assert.equal(isStaleProcessing(job, NOW), true);
});

test("isStaleProcessing: PROCESSING job started recently is not stale", () => {
  const job = { status: "PROCESSING" as const, started_at: minutesAgo(1) };
  assert.equal(isStaleProcessing(job, NOW), false);
});

test("isStaleProcessing: non-PROCESSING jobs are never stale", () => {
  const job = { status: "PENDING" as const, started_at: minutesAgo(999) };
  assert.equal(isStaleProcessing(job, NOW), false);
});

// --- 3. Retry behaviour ---

test("isRetryEligible: FAILED job under max_retries past cooldown is eligible", () => {
  const job = { status: "FAILED" as const, retry_count: 1, max_retries: 3, completed_at: new Date(NOW.getTime() - RETRY_COOLDOWN_MS - 1000).toISOString() };
  assert.equal(isRetryEligible(job, NOW), true);
});

test("isRetryEligible: FAILED job still within cooldown is not eligible yet", () => {
  const job = { status: "FAILED" as const, retry_count: 1, max_retries: 3, completed_at: minutesAgo(1) };
  assert.equal(isRetryEligible(job, NOW), false);
});

test("isRetryEligible: FAILED job at max_retries is never retried (permanent failure)", () => {
  const job = { status: "FAILED" as const, retry_count: 3, max_retries: 3, completed_at: minutesAgo(999) };
  assert.equal(isRetryEligible(job, NOW), false);
});

test("isRetryEligible: non-FAILED jobs are never retry-eligible", () => {
  const job = { status: "COMPLETED" as const, retry_count: 0, max_retries: 3, completed_at: minutesAgo(999) };
  assert.equal(isRetryEligible(job, NOW), false);
});

// --- 2. Job dependency flow ---

test("getNextJobType: CRAWL_WEBSITE -> RUN_SEO_AUDIT -> GENERATE_SEO_OPPORTUNITIES -> null", () => {
  assert.equal(getNextJobType("CRAWL_WEBSITE"), "RUN_SEO_AUDIT");
  assert.equal(getNextJobType("RUN_SEO_AUDIT"), "GENERATE_SEO_OPPORTUNITIES");
  assert.equal(getNextJobType("GENERATE_SEO_OPPORTUNITIES"), null);
});

test("getNextJobType: ANALYSE_WEBSITE is never auto-chained into anything", () => {
  assert.equal(getNextJobType("ANALYSE_WEBSITE"), null);
});

test("getNextJobType: KEYWORD_DISCOVERY is never auto-chained (its own independent schedule)", () => {
  assert.equal(getNextJobType("KEYWORD_DISCOVERY"), null);
});

test("getNextJobType: SEARCH_CONSOLE_SYNC -> ANALYSE_SEARCH_PERFORMANCE -> null (Phase 2D chaining)", () => {
  assert.equal(getNextJobType("SEARCH_CONSOLE_SYNC"), "ANALYSE_SEARCH_PERFORMANCE");
  assert.equal(getNextJobType("ANALYSE_SEARCH_PERFORMANCE"), null);
});

test("getNextJobType: FETCH_SERP_RESULTS -> ANALYSE_COMPETITORS -> ANALYSE_COMPETITOR_GAPS -> null (Phase 3 chaining)", () => {
  assert.equal(getNextJobType("FETCH_SERP_RESULTS"), "ANALYSE_COMPETITORS");
  assert.equal(getNextJobType("ANALYSE_COMPETITORS"), "ANALYSE_COMPETITOR_GAPS");
  assert.equal(getNextJobType("ANALYSE_COMPETITOR_GAPS"), null);
});

test("getNextJobType: GENERATE_CONTENT/QA_CONTENT/REVISE_CONTENT are never auto-chained by the generic website-scoped mechanism (Phase 4 — each handler self-chains, scoped by content_job_id)", () => {
  assert.equal(getNextJobType("GENERATE_CONTENT"), null);
  assert.equal(getNextJobType("QA_CONTENT"), null);
  assert.equal(getNextJobType("REVISE_CONTENT"), null);
});

// --- 7 & 8. Successful crawl triggers next stage / failed crawl does not ---

test("shouldAdvancePipeline: only COMPLETED jobs advance the pipeline", () => {
  assert.equal(shouldAdvancePipeline("COMPLETED"), true);
  assert.equal(shouldAdvancePipeline("FAILED"), false);
  assert.equal(shouldAdvancePipeline("PENDING"), false);
  assert.equal(shouldAdvancePipeline("PROCESSING"), false);
  assert.equal(shouldAdvancePipeline("CANCELLED"), false);
});
