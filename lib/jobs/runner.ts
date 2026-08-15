import { getJob, markJobStatus, listJobsPending } from "@/lib/db/jobs";
import { handleCrawlWebsite } from "@/lib/jobs/handlers/crawl";
import { handleRunSeoAudit } from "@/lib/jobs/handlers/audit";
import { handleGenerateSeoOpportunities } from "@/lib/jobs/handlers/opportunities";
import type { JobHandler } from "@/lib/jobs/types";
import type { JobType } from "@/lib/supabase/types";

const HANDLERS: Record<JobType, JobHandler> = {
  CRAWL_WEBSITE: handleCrawlWebsite,
  RUN_SEO_AUDIT: handleRunSeoAudit,
  ANALYSE_WEBSITE: handleGenerateSeoOpportunities,
  GENERATE_SEO_OPPORTUNITIES: handleGenerateSeoOpportunities,
};

/**
 * Executes a single job by id: marks it PROCESSING, runs the handler for its
 * job_type, and marks it COMPLETED/FAILED with the result/error. Safe to call
 * more than once for the same job (a second call on an already-terminal job
 * is a no-op) — this plus each handler's own idempotent writes (upserts,
 * status transitions) is what "idempotent where practical" means in Phase 1
 * without a full at-least-once-delivery queue.
 */
export async function processJob(jobId: string): Promise<void> {
  const job = await getJob(jobId);
  if (!job) {
    console.error(`[jobs] processJob: job ${jobId} not found`);
    return;
  }
  if (job.status === "COMPLETED" || job.status === "CANCELLED") {
    console.log(`[jobs] job ${jobId} already terminal (${job.status}); skipping`);
    return;
  }

  const handler = HANDLERS[job.job_type];
  console.log(`[jobs] starting ${job.job_type} job ${jobId} (website ${job.website_id ?? "n/a"})`);
  await markJobStatus(jobId, "PROCESSING");

  try {
    const result = await handler({ job });
    await markJobStatus(jobId, "COMPLETED", { result });
    console.log(`[jobs] completed ${job.job_type} job ${jobId}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[jobs] failed ${job.job_type} job ${jobId}: ${message}`);
    await markJobStatus(jobId, "FAILED", { error: message, retry_count: job.retry_count + 1 });
  }
}

/** Sweeps any PENDING jobs and processes them one at a time. Used by the manual
 * `/api/jobs/process` endpoint and `scripts/run-pending-jobs.ts` — the seam a
 * real cron/worker would eventually call instead. */
export async function processPendingJobs(limit = 10): Promise<{ processed: number }> {
  const pending = await listJobsPending(limit);
  for (const job of pending) {
    await processJob(job.id);
  }
  return { processed: pending.length };
}
