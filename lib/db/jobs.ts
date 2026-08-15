import { supabaseAdmin } from "@/lib/supabase/server";
import { jsonb, type Database, type JobStatus } from "@/lib/supabase/types";

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
