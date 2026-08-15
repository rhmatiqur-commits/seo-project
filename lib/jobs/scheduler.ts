import { createJob, findActiveJob, listStaleProcessingJobs, listRetryEligibleFailedJobs, requeueFailedJob, markJobStale } from "@/lib/db/jobs";
import { listActiveWebsites } from "@/lib/db/websites";
import { createSchedulerRun, completeSchedulerRun } from "@/lib/db/scheduler-runs";
import { processPendingJobs } from "@/lib/jobs/runner";
import { shouldEnqueueWebsiteCrawl, shouldEnqueueKeywordDiscovery } from "@/lib/jobs/policy";

export interface SchedulerSummary {
  schedulerRunId: string;
  websitesChecked: number;
  crawlJobsCreated: number;
  crawlJobsSkippedDuplicate: number;
  keywordDiscoveryJobsCreated: number;
  keywordDiscoveryJobsSkippedDuplicate: number;
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
    const retryable = await listRetryEligibleFailedJobs(now);
    for (const job of retryable) {
      console.log(`[scheduler] retrying job ${job.id} (${job.job_type}, attempt ${job.retry_count + 1}/${job.max_retries})`);
      await requeueFailedJob(job.id);
    }
    if (retryable.length > 0) console.log(`[scheduler] requeued ${retryable.length} job(s) for retry`);

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
        jobs_retried: retryable.length,
        stale_recovered: stale.length,
      },
      {
        summary: {
          stoppedReason: worker.stoppedReason,
          crawlJobsSkippedDuplicate,
          keywordDiscoveryJobsCreated,
          keywordDiscoveryJobsSkippedDuplicate,
        },
      }
    );

    console.log(
      `[scheduler] sweep complete: websites=${websites.length} crawlsCreated=${crawlJobsCreated} keywordDiscoveryCreated=${keywordDiscoveryJobsCreated} staleRecovered=${stale.length} retried=${retryable.length} workerProcessed=${worker.processed}`
    );

    return {
      schedulerRunId: run.id,
      websitesChecked: websites.length,
      crawlJobsCreated,
      crawlJobsSkippedDuplicate,
      keywordDiscoveryJobsCreated,
      keywordDiscoveryJobsSkippedDuplicate,
      staleRecovered: stale.length,
      jobsRetried: retryable.length,
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
