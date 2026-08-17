import { supabaseAdmin } from "@/lib/supabase/server";
import type { Database, TaskStatus } from "@/lib/supabase/types";

type TaskRow = Database["public"]["Tables"]["seo_tasks"]["Row"];
type TaskInsert = Database["public"]["Tables"]["seo_tasks"]["Insert"];

export async function insertTask(input: TaskInsert): Promise<TaskRow> {
  const db = supabaseAdmin();
  const { data, error } = await db.from("seo_tasks").insert(input).select().single();
  if (error) throw error;
  return data;
}

export async function getTask(id: string): Promise<TaskRow | null> {
  const db = supabaseAdmin();
  const { data, error } = await db.from("seo_tasks").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function listTasksForWebsite(websiteId: string): Promise<TaskRow[]> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("seo_tasks")
    .select("*")
    .eq("website_id", websiteId)
    .order("priority", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function updateTaskStatus(id: string, status: TaskStatus): Promise<TaskRow> {
  const db = supabaseAdmin();
  const { data, error } = await db.from("seo_tasks").update({ status }).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

/** The seo_tasks row created when this opportunity was promoted (every
 * promotion path — Phase 1 AI, Phase 2B keyword-discovery, Phase 2D/3
 * search-performance — creates exactly one task per opportunity), used by
 * the content-brief builder (Phase 4) to record the full opportunity -> task
 * -> brief traceability chain. Null if the opportunity was never promoted
 * through one of those paths (shouldn't happen for a content-eligible
 * opportunity, but never assumed). */
export async function getTaskForOpportunity(opportunityId: string): Promise<TaskRow | null> {
  const db = supabaseAdmin();
  const { data, error } = await db.from("seo_tasks").select("*").eq("opportunity_id", opportunityId).order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (error) throw error;
  return data;
}
