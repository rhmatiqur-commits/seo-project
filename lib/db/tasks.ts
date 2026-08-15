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
