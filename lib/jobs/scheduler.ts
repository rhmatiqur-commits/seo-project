import { createJob, findActiveJob, listStaleProcessingJobs, listRetryEligibleFailedJobs, requeueFailedJob, markJobStale } from "@/lib/db/jobs";
import { listActiveWebsites } from "@/lib/db/websites";
import { listActiveWebsitesWithSearchConsoleConnection } from "@/lib/db/search-console";
import { createSchedulerRun, completeSchedulerRun } from "@/lib/db/scheduler-runs";
import { processPendingJobs } from "@/lib/jobs/runner";
import { shouldEnqueueWebsiteCrawl, shouldEnqueueKeywordDiscovery, shouldEnqueueSearchConsoleSync, shouldEnqueueSerpFetch } from "@/lib/jobs/policy";

export interface SchedulerSummary {
  schedulerRunId: string;
  websitesChecked: number;
  crawlJobsCreated: number;
  crawlJobsSkippedDuplicate: number;
  keywordDiscoveryJobsCreated: number;
  keywordDiscoveryJobsSkippedDuplicate: number;
  searchConsoleSyncJobsCreated: number;
  searchConsoleSyncJobsSkippedDuplicate: number;
  serpFetchJobsCreated: number;
  serpFetchJobsSkippedDuplicate: number;
  staleRecovered: number;
  jobsRetried: number;
  worker: { processed: number; completed: number; failed: number; iterations: number; stoppedReason: string };
}

/**
 * The single scheduled sweep: recover stale jobs -> requeue retry-eligible
 * failures -> enqueue CRAWL_WEBSITE for due active websites -> run the
 * bounded worker loop -> record the run. Safe to call on any cadence (daily,
 * hourly, twice in a row) — each phase is independently idempotent, so
 * calling it more often than a website's crawl_frequency_days just means
 * most invocations do maintenance only and find nothing due yet.
 */
export async function runScheduledSweep(): Promise<SchedulerSummary> {
  const now = new Date();
  console.log("[scheduler] sweep starting");
  const run = await createSchedulerRun();

  try {
    // 1. Stale-job recovery — a PROCESSING job stuck past the threshold is
    // treated as failed so it flows into the normal retry path below.
    const stale = await listStaleProcessingJobs(now);
    for (const job of stale) {
      console.log(`[scheduler] recovering stale job ${job.id} (${job.job_type}, started_at=${job.started_at})`);
      await markJobStale(job.id, job.retry_count);
    }
    if (stale.length > 0) console.log(`[scheduler] recovered ${stale.length} stale job(s)`);

    // 2. Retry-eligible failures (bounded by max_retries, gated by cooldown —
    // see lib/jobs/policy.ts). Requeuing sets them back to PENDING for the
    // worker loop below to pick up.
    //
    // A failed job can sit past its retry cooldown while a *newer* job with
    // the same idempotency_key has since been created and is still active
    // (PENDING/PROCESSING) or was already superseded some other way — e.g.
    // this exact scenario, found live: a FETCH_SERP_RESULTS run failed
    // (bad DataForSEO credentials at the time), the operator fixed the
    // credentials and re-ran it manually before this old failure's cooldown
    // even elapsed, and a *third*, still-PENDING retry attempt from an
    // earlier sweep was left over too. When the cooldown finally did elapse,
    // requeuing the original failure violated jobs_idempotency_key_uidx
    // against that leftover PENDING row and crashed the entire sweep — every
    // other phase (crawl/keyword-discovery/search-console-sync/content jobs)
    // never got to run because of one stale retry. Requeuing is now treated
    // as soft-failable on that specific constraint (23505 on this index) —
    // "superseded, nothing to do" — exactly like every other duplicate-job
    // guard in this codebase, instead of being fatal to the whole sweep.
    const retryable = await listRetryEligibleFailedJobs(now);
    let jobsRetried = 0;
    for (const job of retryable) {
      console.log(`[scheduler] retrying job ${job.id} (${job.job_type}, attempt ${job.retry_count + 1}/${job.max_retries})`);
      try {
        await requeueFailedJob(job.id);
        jobsRetried++;
      } catch (error) {
        const pgCode = (error as { code?: string } | null)?.code;
        if (pgCode === "23505") {
          console.log(`[scheduler] skipped retry for job ${job.id}: a newer job with the same idempotency_key is already active (superseded)`);
          continue;
        }
        throw error;
      }
    }
    if (jobsRetried > 0) console.log(`[scheduler] requeued ${jobsRetried} job(s) for retry`);

    // 3. Enqueue CRAWL_WEBSITE for due active websites, skipping any that
    // already have an active (PENDING/PROCESSING) crawl job.
    const websites = await listActiveWebsites();
    let crawlJobsCreated = 0;
    let crawlJobsSkippedDuplicate = 0;
    for (const website of websites) {
      const existingActiveCrawlJob = await findActiveJob(website.id, "CRAWL_WEBSITE");
      if (!shouldEnqueueWebsiteCrawl(website, existingActiveCrawlJob, now)) {
        if (existingActiveCrawlJob) {
          console.log(`[scheduler] skipped ${website.id} (${website.name}): crawl already active`);
          crawlJobsSkippedDuplicate++;
        }
        continue;
      }
      console.log(`[scheduler] website ${website.id} (${website.name}) is due for crawl`);
      const { created } = await createJob({
        organization_id: website.organization_id,
        website_id: website.id,
        job_type: "CRAWL_WEBSITE",
        idempotency_key: `CRAWL_WEBSITE:${website.id}`,
      });
      if (created) {
        crawlJobsCreated++;
        console.log(`[scheduler] created CRAWL_WEBSITE job for ${website.id}`);
      } else {
        crawlJobsSkippedDuplicate++;
      }
    }

    // 3b. Same due-check-and-enqueue for KEYWORD_DISCOVERY, on its own
    // independent per-website schedule (next_keyword_discovery_at /
    // keyword_discovery_frequency_days) — deliberately not chained off the
    // crawl pipeline (see lib/jobs/policy.ts getNextJobType).
    let keywordDiscoveryJobsCreated = 0;
    let keywordDiscoveryJobsSkippedDuplicate = 0;
    for (const website of websites) {
      const existingActiveDiscoveryJob = await findActiveJob(website.id, "KEYWORD_DISCOVERY");
      if (!shouldEnqueueKeywordDiscovery(website, existingActiveDiscoveryJob, now)) {
        if (existingActiveDiscoveryJob) keywordDiscoveryJobsSkippedDuplicate++;
        continue;
      }
      console.log(`[scheduler] website ${website.id} (${website.name}) is due for keyword discovery`);
      const { created } = await createJob({
        organization_id: website.organization_id,
        website_id: website.id,
        job_type: "KEYWORD_DISCOVERY",
        idempotency_key: `KEYWORD_DISCOVERY:${website.id}`,
      });
      if (created) {
        keywordDiscoveryJobsCreated++;
        console.log(`[scheduler] created KEYWORD_DISCOVERY job for ${website.id}`);
      } else {
        keywordDiscoveryJobsSkippedDuplicate++;
      }
    }

    // 3c. Same due-check-and-enqueue for SEARCH_CONSOLE_SYNC, scoped to only
    // websites with an active connection (most websites won't have one) —
    // its own independent schedule (next_search_console_sync_at /
    // search_console_sync_frequency_days), not chained off the crawl pipeline.
    const searchConsoleWebsites = await listActiveWebsitesWithSearchConsoleConnection();
    let searchConsoleSyncJobsCreated = 0;
    let searchConsoleSyncJobsSkippedDuplicate = 0;
    for (const website of searchConsoleWebsites) {
      const existingActiveSyncJob = await findActiveJob(website.id, "SEARCH_CONSOLE_SYNC");
      if (!shouldEnqueueSearchConsoleSync(website, existingActiveSyncJob, now)) {
        if (existingActiveSyncJob) searchConsoleSyncJobsSkippedDuplicate++;
        continue;
      }
      console.log(`[scheduler] website ${website.id} (${website.name}) is due for Search Console sync`);
      const { created } = await createJob({
        organization_id: website.organization_id,
        website_id: website.id,
        job_type: "SEARCH_CONSOLE_SYNC",
        idempotency_key: `SEARCH_CONSOLE_SYNC:${website.id}`,
      });
      if (created) {
        searchConsoleSyncJobsCreated++;
        console.log(`[scheduler] created SEARCH_CONSOLE_SYNC job for ${website.id}`);
      } else {
        searchConsoleSyncJobsSkippedDuplicate++;
      }
    }

    // 3d. Same due-check-and-enqueue for FETCH_SERP_RESULTS (Phase 3), on its
    // own independent per-website schedule (next_serp_fetch_at /
    // serp_fetch_frequency_days) — not scoped to a connection prerequisite
    // like Search Console sync (the SERP provider needs no per-website
    // OAuth); per-keyword tiered cadence is handled inside the job itself.
    let serpFetchJobsCreated = 0;
    let serpFetchJobsSkippedDuplicate = 0;
    for (const website of websites) {
      const existingActiveSerpJob = await findActiveJob(website.id, "FETCH_SERP_RESULTS");
      if (!shouldEnqueueSerpFetch(website, existingActiveSerpJob, now)) {
        if (existingActiveSerpJob) serpFetchJobsSkippedDuplicate++;
        continue;
      }
      console.log(`[scheduler] website ${website.id} (${website.name}) is due for SERP fetch`);
      const { created } = await createJob({
        organization_id: website.organization_id,
        website_id: website.id,
        job_type: "FETCH_SERP_RESULTS",
        idempotency_key: `FETCH_SERP_RESULTS:${website.id}`,
      });
      if (created) {
        serpFetchJobsCreated++;
        console.log(`[scheduler] created FETCH_SERP_RESULTS job for ${website.id}`);
      } else {
        serpFetchJobsSkippedDuplicate++;
      }
    }

    // 4. Explicitly process the queue within this invocation (bounded), so
    // the pipeline advances as far as it can before returning — see
    // lib/jobs/runner.ts processPendingJobs and lib/jobs/policy.ts for the budget.
    console.log("[scheduler] worker starting");
    const worker = await processPendingJobs();
    console.log("[scheduler] worker finished");

    await completeSchedulerRun(
      run.id,
      "COMPLETED",
      {
        websites_checked: websites.length,
        crawl_jobs_created: crawlJobsCreated,
        jobs_processed: worker.processed,
        jobs_completed: worker.completed,
        jobs_failed: worker.failed,
        jobs_retried: jobsRetried,
        stale_recovered: stale.length,
      },
      {
        summary: {
          stoppedReason: worker.stoppedReason,
          crawlJobsSkippedDuplicate,
          keywordDiscoveryJobsCreated,
          keywordDiscoveryJobsSkippedDuplicate,
          searchConsoleWebsitesChecked: searchConsoleWebsites.length,
          searchConsoleSyncJobsCreated,
          searchConsoleSyncJobsSkippedDuplicate,
          serpFetchJobsCreated,
          serpFetchJobsSkippedDuplicate,
        },
      }
    );

    console.log(
      `[scheduler] sweep complete: websites=${websites.length} crawlsCreated=${crawlJobsCreated} keywordDiscoveryCreated=${keywordDiscoveryJobsCreated} searchConsoleSyncCreated=${searchConsoleSyncJobsCreated} serpFetchCreated=${serpFetchJobsCreated} staleRecovered=${stale.length} retried=${jobsRetried} workerProcessed=${worker.processed}`
    );

    return {
      schedulerRunId: run.id,
      websitesChecked: websites.length,
      crawlJobsCreated,
      crawlJobsSkippedDuplicate,
      keywordDiscoveryJobsCreated,
      keywordDiscoveryJobsSkippedDuplicate,
      searchConsoleSyncJobsCreated,
      searchConsoleSyncJobsSkippedDuplicate,
      serpFetchJobsCreated,
      serpFetchJobsSkippedDuplicate,
      staleRecovered: stale.length,
      jobsRetried,
      worker,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[scheduler] sweep failed: ${message}`);
    await completeSchedulerRun(
      run.id,
      "FAILED",
      {
        websites_checked: 0,
        crawl_jobs_created: 0,
        jobs_processed: 0,
        jobs_completed: 0,
        jobs_failed: 0,
        jobs_retried: 0,
        stale_recovered: 0,
      },
      { error: message }
    );
    throw error;
  }
}
