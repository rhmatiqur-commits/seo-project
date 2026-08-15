import { supabaseAdmin } from "@/lib/supabase/server";
import { jsonb, type Database, type JobStatus } from "@/lib/supabase/types";
import { isStaleProcessing, isRetryEligible } from "@/lib/jobs/policy";

type JobRow = Database["public"]["Tables"]["jobs"]["Row"];
type JobInsertRaw = Database["public"]["Tables"]["jobs"]["Insert"];
type JobInsert = Omit<JobInsertRaw, "payload" | "result"> & {
  payload?: Record<string, unknown>;
  result?: Record<string, unknown> | null;
};

/**
 * Creates a job row. If `idempotency_key` is supplied and a non-terminal job
 * (PENDING/PROCESSING) with the same key already exists, that existing job is
 * returned instead of creating a duplicate — this is what keeps "start crawl"
 * safe to click twice in a row from the admin UI.
 */
export async function createJob(input: JobInsert): Promise<{ job: JobRow; created: boolean }> {
  const db = supabaseAdmin();

  if (input.idempotency_key) {
    const { data: existing, error: findError } = await db
      .from("jobs")
      .select("*")
      .eq("idempotency_key", input.idempotency_key)
      .in("status", ["PENDING", "PROCESSING"])
      .maybeSingle();
    if (findError) throw findError;
    if (existing) return { job: existing, created: false };
  }

  const { data, error } = await db
    .from("jobs")
    .insert({ status: "PENDING", ...input, payload: jsonb(input.payload ?? {}), result: jsonb(input.result ?? null) })
    .select()
    .single();
  if (error) throw error;
  return { job: data, created: true };
}

export async function getJob(id: string): Promise<JobRow | null> {
  const db = supabaseAdmin();
  const { data, error } = await db.from("jobs").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function listJobsPending(limit = 20): Promise<JobRow[]> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("jobs")
    .select("*")
    .eq("status", "PENDING")
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return data;
}

export async function listJobsForWebsite(websiteId: string, limit = 20): Promise<JobRow[]> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("jobs")
    .select("*")
    .eq("website_id", websiteId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

export async function markJobStatus(
  id: string,
  status: JobStatus,
  patch: { result?: Record<string, unknown> | null; error?: string | null; retry_count?: number } = {}
): Promise<JobRow> {
  const db = supabaseAdmin();
  const now = new Date().toISOString();
  const timestampPatch: Record<string, unknown> = {};
  if (status === "PROCESSING") timestampPatch.started_at = now;
  if (status === "COMPLETED" || status === "FAILED" || status === "CANCELLED") {
    timestampPatch.completed_at = now;
  }
  const { data, error } = await db
    .from("jobs")
    .update({ status, ...patch, result: patch.result !== undefined ? jsonb(patch.result) : undefined, ...timestampPatch })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Most recent job of a given type (optionally filtered by status) for a
 * website — used by the admin automation page for "last SEO analysis" etc. */
export async function getLatestJobForWebsite(
  websiteId: string,
  jobType: JobRow["job_type"],
  status?: JobStatus
): Promise<JobRow | null> {
  const db = supabaseAdmin();
  let query = db.from("jobs").select("*").eq("website_id", websiteId).eq("job_type", jobType);
  if (status) query = query.eq("status", status);
  const { data, error } = await query.order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data;
}

/** Any job with an active idempotency-scoped status for this website+type, if one exists. */
export async function findActiveJob(websiteId: string, jobType: JobRow["job_type"]): Promise<JobRow | null> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("jobs")
    .select("*")
    .eq("website_id", websiteId)
    .eq("job_type", jobType)
    .in("status", ["PENDING", "PROCESSING"])
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** PROCESSING jobs whose started_at is old enough to be considered stuck.
 * Filtered in application code (via the same `isStaleProcessing` policy the
 * unit tests exercise) rather than duplicating the threshold math in SQL. */
export async function listStaleProcessingJobs(now = new Date()): Promise<JobRow[]> {
  const db = supabaseAdmin();
  const { data, error } = await db.from("jobs").select("*").eq("status", "PROCESSING");
  if (error) throw error;
  return data.filter((job) => isStaleProcessing(job, now));
}

/** FAILED jobs eligible for another attempt (retry_count < max_retries, past cooldown). */
export async function listRetryEligibleFailedJobs(now = new Date()): Promise<JobRow[]> {
  const db = supabaseAdmin();
  const { data, error } = await db.from("jobs").select("*").eq("status", "FAILED");
  if (error) throw error;
  return data.filter((job) => isRetryEligible(job, now));
}

/** Resets a FAILED job back to PENDING for another attempt — clears the
 * previous attempt's timestamps/error but keeps retry_count (already
 * incremented when it failed) so the retry budget is respected. */
export async function requeueFailedJob(id: string): Promise<JobRow> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("jobs")
    .update({ status: "PENDING", started_at: null, completed_at: null, error: null })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Marks a stale PROCESSING job as failed so it flows through the normal
 * retry-eligibility path on the next sweep, rather than a bespoke recovery route. */
export async function markJobStale(id: string, retryCount: number): Promise<JobRow> {
  return markJobStatus(id, "FAILED", {
    error: "stale job: exceeded max processing duration, recovered by sweep",
    retry_count: retryCount + 1,
  });
}

export interface JobStats {
  byStatus: Record<JobStatus, number>;
  averageDurationMs: number | null;
  lastSuccessfulRunAt: string | null;
  sampledJobCount: number;
}

/** Basic stats for the admin UI, computed over the most recent jobs rather
 * than the whole table — fine at Phase 1/2A scale, revisit with a real
 * aggregate query if the jobs table grows large. */
export async function getJobStats(sampleSize = 500): Promise<JobStats> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("jobs")
    .select("status, started_at, completed_at")
    .order("created_at", { ascending: false })
    .limit(sampleSize);
  if (error) throw error;

  const byStatus: Record<JobStatus, number> = {
    PENDING: 0,
    PROCESSING: 0,
    COMPLETED: 0,
    FAILED: 0,
    CANCELLED: 0,
  };
  let totalDurationMs = 0;
  let durationSamples = 0;
  let lastSuccessfulRunAt: string | null = null;

  for (const job of data) {
    byStatus[job.status]++;
    if (job.status === "COMPLETED" && job.started_at && job.completed_at) {
      totalDurationMs += new Date(job.completed_at).getTime() - new Date(job.started_at).getTime();
      durationSamples++;
      if (!lastSuccessfulRunAt || job.completed_at > lastSuccessfulRunAt) lastSuccessfulRunAt = job.completed_at;
    }
  }

  return {
    byStatus,
    averageDurationMs: durationSamples > 0 ? Math.round(totalDurationMs / durationSamples) : null,
    lastSuccessfulRunAt,
    sampledJobCount: data.length,
  };
}
