import type { Database } from "@/lib/supabase/types";

export type JobRow = Database["public"]["Tables"]["jobs"]["Row"];

export interface JobHandlerContext {
  job: JobRow;
}

export type JobHandler = (ctx: JobHandlerContext) => Promise<Record<string, unknown>>;

/**
 * Thrown by a handler to mean "this failure will never succeed on retry" —
 * content isn't APPROVED, the website doesn't belong to the claimed
 * organization, credentials are invalid, the target page doesn't exist,
 * etc. `lib/jobs/runner.ts`'s processJob catches this specially and marks
 * the job's retry_count at max_retries so lib/jobs/policy.ts's
 * isRetryEligible never fires again — a generic primitive any job handler
 * can use (introduced for Phase 5's publishing jobs, but not specific to
 * them), instead of every handler inventing its own "don't retry this" signal.
 * Any other thrown error is treated as retryable, exactly as before.
 */
export class PermanentJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentJobError";
  }
}
