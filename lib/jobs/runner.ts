import { getJob, markJobStatus, listJobsPending, createJob } from "@/lib/db/jobs";
import { handleCrawlWebsite } from "@/lib/jobs/handlers/crawl";
import { handleRunSeoAudit } from "@/lib/jobs/handlers/audit";
import { handleGenerateSeoOpportunities } from "@/lib/jobs/handlers/opportunities";
import { getNextJobType, shouldAdvancePipeline, WORKER_LOOP_MAX_DURATION_MS, WORKER_LOOP_MAX_ITERATIONS } from "@/lib/jobs/policy";
import type { JobHandler, JobRow } from "@/lib/jobs/types";
import type { JobType } from "@/lib/supabase/types";

const HANDLERS: Record<JobType, JobHandler> = {
  CRAWL_WEBSITE: handleCrawlWebsite,
  RUN_SEO_AUDIT: handleRunSeoAudit,
  ANALYSE_WEBSITE: handleGenerateSeoOpportunities,
  GENERATE_SEO_OPPORTUNITIES: handleGenerateSeoOpportunities,
};

/**
 * On a COMPLETED job, enqueues the next pipeline stage for the same website
 * (idempotently — same createJob()+idempotency_key path every trigger source
 * uses, so this composes safely with manual/API triggers and the scheduler).
 * A FAILED job never reaches this — see processJob's catch branch, which
 * returns before calling this. That's what makes "failed crawl doesn't
 * trigger the audit" true by construction rather than by an extra check here.
 */
async function advancePipeline(job: JobRow): Promise<void> {
  if (!shouldAdvancePipeline(job.status) || !job.website_id) return;
  const nextType = getNextJobType(job.job_type);
  if (!nextType) {
    console.log(`[jobs] pipeline reached its end for website ${job.website_id} (last stage: ${job.job_type})`);
    return;
  }

  const idempotencyKey = `${nextType}:${job.website_id}`;
  const { job: nextJob, created } = await createJob({
    organization_id: job.organization_id,
    website_id: job.website_id,
    job_type: nextType,
    idempotency_key: idempotencyKey,
  });

  if (created) {
    console.log(`[jobs] chained ${job.job_type} -> ${nextType} for website ${job.website_id} (job ${nextJob.id})`);
  } else {
    console.log(`[jobs] skipped chaining ${job.job_type} -> ${nextType} for website ${job.website_id}: already active (job ${nextJob.id})`);
  }
}

/**
 * Executes a single job by id: marks it PROCESSING, runs the handler for its
 * job_type, and marks it COMPLETED/FAILED with the result/error. On success,
 * enqueues the next pipeline stage. Safe to call more than once for the same
 * job (a second call on an already-terminal job is a no-op) — this plus each
 * handler's own idempotent writes (upserts, status transitions) is what
 * "idempotent where practical" means without a full at-least-once-delivery queue.
 */
export async function processJob(jobId: string): Promise<JobRow | null> {
  const job = await getJob(jobId);
  if (!job) {
    console.error(`[jobs] processJob: job ${jobId} not found`);
    return null;
  }
  if (job.status === "COMPLETED" || job.status === "CANCELLED") {
    console.log(`[jobs] job ${jobId} already terminal (${job.status}); skipping`);
    return job;
  }

  const handler = HANDLERS[job.job_type];
  console.log(`[jobs] starting ${job.job_type} job ${jobId} (website ${job.website_id ?? "n/a"})`);
  await markJobStatus(jobId, "PROCESSING");

  try {
    const result = await handler({ job });
    const completed = await markJobStatus(jobId, "COMPLETED", { result });
    console.log(`[jobs] completed ${job.job_type} job ${jobId}`);
    await advancePipeline(completed);
    return completed;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[jobs] failed ${job.job_type} job ${jobId}: ${message}`);
    return markJobStatus(jobId, "FAILED", { error: message, retry_count: job.retry_count + 1 });
  }
}

export interface WorkerLoopResult {
  processed: number;
  completed: number;
  failed: number;
  iterations: number;
  stoppedReason: "queue_empty" | "max_iterations" | "max_duration";
}

/**
 * Drains PENDING jobs, re-querying between each one so a job chained by
 * advancePipeline() gets picked up in the same invocation instead of waiting
 * for the next sweep — bounded by a time budget and iteration cap so a single
 * HTTP request/cron invocation can't run forever (see lib/jobs/policy.ts).
 * This is "the scheduled worker must explicitly process jobs" instead of
 * relying on a detached fire-and-forget promise outliving the response.
 */
export async function processPendingJobs(
  batchSize = 1,
  opts: { maxDurationMs?: number; maxIterations?: number } = {}
): Promise<WorkerLoopResult> {
  const maxDurationMs = opts.maxDurationMs ?? WORKER_LOOP_MAX_DURATION_MS;
  const maxIterations = opts.maxIterations ?? WORKER_LOOP_MAX_ITERATIONS;
  const startedAt = Date.now();

  console.log(`[jobs] worker loop starting (maxDurationMs=${maxDurationMs}, maxIterations=${maxIterations})`);

  let processed = 0;
  let completed = 0;
  let failed = 0;
  let iterations = 0;
  let stoppedReason: WorkerLoopResult["stoppedReason"] = "queue_empty";

  while (true) {
    if (iterations >= maxIterations) {
      stoppedReason = "max_iterations";
      break;
    }
    if (Date.now() - startedAt > maxDurationMs) {
      stoppedReason = "max_duration";
      break;
    }

    const pending = await listJobsPending(batchSize);
    if (pending.length === 0) {
      stoppedReason = "queue_empty";
      break;
    }

    for (const job of pending) {
      const result = await processJob(job.id);
      processed++;
      if (result?.status === "COMPLETED") completed++;
      if (result?.status === "FAILED") failed++;
    }
    iterations++;
  }

  console.log(
    `[jobs] worker loop finished: processed=${processed} completed=${completed} failed=${failed} iterations=${iterations} stoppedReason=${stoppedReason}`
  );
  return { processed, completed, failed, iterations, stoppedReason };
}
