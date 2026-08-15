import { createJob } from "@/lib/db/jobs";
import { processJob } from "@/lib/jobs/runner";
import type { JobType } from "@/lib/supabase/types";

/**
 * Creates a job row and starts processing it without blocking the caller.
 * This is what API routes call so "trigger crawl" returns immediately with a
 * job id the admin UI can poll, instead of holding the HTTP request open for
 * the whole crawl.
 *
 * Note: this relies on the Node process staying alive after the response is
 * sent (true for `next dev`/`next start`). On a serverless deployment target
 * this fire-and-forget promise isn't guaranteed to finish — that's exactly
 * why `/api/jobs/process` and `scripts/run-pending-jobs.ts` exist as a
 * fallback sweep, and why a real worker/queue is the Phase 2 upgrade path.
 */
export async function triggerJob(input: {
  organizationId: string;
  websiteId?: string;
  jobType: JobType;
  payload?: Record<string, unknown>;
  /** When set, an existing non-terminal job with the same key is reused instead of creating a duplicate. */
  idempotencyKey?: string;
}): Promise<{ jobId: string; created: boolean }> {
  const { job, created } = await createJob({
    organization_id: input.organizationId,
    website_id: input.websiteId ?? null,
    job_type: input.jobType,
    payload: input.payload ?? {},
    idempotency_key: input.idempotencyKey ?? null,
  });

  if (created) {
    void processJob(job.id).catch((err) => {
      console.error(`[jobs] unhandled error processing job ${job.id}:`, err);
    });
  }

  return { jobId: job.id, created };
}
