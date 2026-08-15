import { supabaseAdmin } from "@/lib/supabase/server";
import { jsonb, type Database } from "@/lib/supabase/types";

type SerpRunRow = Database["public"]["Tables"]["serp_runs"]["Row"];
type SerpResultRow = Database["public"]["Tables"]["serp_results"]["Row"];
type SerpResultInsert = Database["public"]["Tables"]["serp_results"]["Insert"];

// ---------------------------------------------------------------------------
// serp_runs — a time series (one row per keyword/location/point-in-time
// request); "avoid duplicate runs" is handled in application logic
// (lib/serp/priority-tier.ts's due-check), not a DB constraint.
// ---------------------------------------------------------------------------

export interface CreateSerpRunInput {
  organizationId: string;
  websiteId: string;
  keywordId: string | null;
  keyword: string;
  location: string | null;
  country: string;
  language: string;
}

export async function createSerpRun(input: CreateSerpRunInput): Promise<SerpRunRow> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("serp_runs")
    .insert({
      organization_id: input.organizationId,
      website_id: input.websiteId,
      keyword_id: input.keywordId,
      keyword: input.keyword,
      location: input.location,
      country: input.country,
      language: input.language,
      status: "PENDING",
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function markSerpRunCompleted(id: string, input: { features: Record<string, unknown>; rawResponse: unknown }): Promise<SerpRunRow> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("serp_runs")
    .update({ status: "COMPLETED", searched_at: new Date().toISOString(), features: jsonb(input.features), raw_response: jsonb(input.rawResponse) })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function markSerpRunFailed(id: string, error_: string): Promise<SerpRunRow> {
  const db = supabaseAdmin();
  const { data, error } = await db.from("serp_runs").update({ status: "FAILED", error: error_ }).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

export async function insertSerpResults(rows: SerpResultInsert[]): Promise<void> {
  if (rows.length === 0) return;
  const db = supabaseAdmin();
  const { error } = await db.from("serp_results").insert(rows);
  if (error) throw error;
}

/** Latest COMPLETED run per keyword (falls back to grouping by keyword text
 * for the rare case keyword_id is null) — used both for the per-keyword
 * "when did we last fetch this" due-check and for building the competitive
 * signals ANALYSE_COMPETITOR_GAPS needs. */
export async function listLatestCompletedSerpRunsForWebsite(websiteId: string): Promise<SerpRunRow[]> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("serp_runs")
    .select("*")
    .eq("website_id", websiteId)
    .eq("status", "COMPLETED")
    .order("searched_at", { ascending: false });
  if (error) throw error;

  const latestByKey = new Map<string, SerpRunRow>();
  for (const run of data) {
    const key = run.keyword_id ?? `text:${run.keyword}`;
    if (!latestByKey.has(key)) latestByKey.set(key, run);
  }
  return Array.from(latestByKey.values());
}

export async function listSerpResultsForRuns(serpRunIds: string[]): Promise<SerpResultRow[]> {
  if (serpRunIds.length === 0) return [];
  const db = supabaseAdmin();
  const { data, error } = await db.from("serp_results").select("*").in("serp_run_id", serpRunIds);
  if (error) throw error;
  return data;
}

export async function listRecentSerpRunsForWebsite(websiteId: string, limit = 20): Promise<SerpRunRow[]> {
  const db = supabaseAdmin();
  const { data, error } = await db.from("serp_runs").select("*").eq("website_id", websiteId).order("created_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return data;
}
