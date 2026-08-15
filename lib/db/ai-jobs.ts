import { supabaseAdmin } from "@/lib/supabase/server";
import { jsonb, type Database, type JobStatus } from "@/lib/supabase/types";

type AiJobRow = Database["public"]["Tables"]["ai_jobs"]["Row"];
type AiJobInsertRaw = Database["public"]["Tables"]["ai_jobs"]["Insert"];
type AiJobInsert = Omit<AiJobInsertRaw, "input_summary" | "result"> & {
  input_summary?: Record<string, unknown>;
  result?: Record<string, unknown> | null;
};

export async function createAiJob(input: AiJobInsert): Promise<AiJobRow> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("ai_jobs")
    .insert({ ...input, input_summary: jsonb(input.input_summary ?? {}), result: jsonb(input.result ?? null) })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function completeAiJob(
  id: string,
  patch: {
    status?: JobStatus;
    result?: Record<string, unknown> | null;
    error?: string | null;
    prompt_tokens?: number | null;
    completion_tokens?: number | null;
    total_tokens?: number | null;
    latency_ms?: number | null;
  }
): Promise<AiJobRow> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("ai_jobs")
    .update({ ...patch, result: patch.result !== undefined ? jsonb(patch.result) : undefined, completed_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}
