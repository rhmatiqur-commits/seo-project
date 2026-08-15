import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isDueForCrawl,
  shouldEnqueueWebsiteCrawl,
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

// --- 7 & 8. Successful crawl triggers next stage / failed crawl does not ---

test("shouldAdvancePipeline: only COMPLETED jobs advance the pipeline", () => {
  assert.equal(shouldAdvancePipeline("COMPLETED"), true);
  assert.equal(shouldAdvancePipeline("FAILED"), false);
  assert.equal(shouldAdvancePipeline("PENDING"), false);
  assert.equal(shouldAdvancePipeline("PROCESSING"), false);
  assert.equal(shouldAdvancePipeline("CANCELLED"), false);
});
