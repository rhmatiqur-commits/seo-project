import { supabaseAdmin } from "@/lib/supabase/server";
import { jsonb, type Database } from "@/lib/supabase/types";

type SchedulerRunRow = Database["public"]["Tables"]["scheduler_runs"]["Row"];

export async function createSchedulerRun(): Promise<SchedulerRunRow> {
  const db = supabaseAdmin();
  const { data, error } = await db.from("scheduler_runs").insert({ status: "PROCESSING" }).select().single();
  if (error) throw error;
  return data;
}

export interface SchedulerRunCounts {
  websites_checked: number;
  crawl_jobs_created: number;
  jobs_processed: number;
  jobs_completed: number;
  jobs_failed: number;
  jobs_retried: number;
  stale_recovered: number;
}

export async function completeSchedulerRun(
  id: string,
  status: "COMPLETED" | "FAILED",
  counts: SchedulerRunCounts,
  extra: { summary?: Record<string, unknown>; error?: string } = {}
): Promise<SchedulerRunRow> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("scheduler_runs")
    .update({
      status,
      completed_at: new Date().toISOString(),
      ...counts,
      summary: jsonb(extra.summary ?? {}),
      error: extra.error ?? null,
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getLastSchedulerRun(): Promise<SchedulerRunRow | null> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("scheduler_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listRecentSchedulerRuns(limit = 10): Promise<SchedulerRunRow[]> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("scheduler_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}
