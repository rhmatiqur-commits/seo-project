import { supabaseAdmin } from "@/lib/supabase/server";
import { jsonb, type Database, type OpportunityStatus } from "@/lib/supabase/types";

type OpportunityRow = Database["public"]["Tables"]["seo_opportunities"]["Row"];
type OpportunityInsertRaw = Database["public"]["Tables"]["seo_opportunities"]["Insert"];
type OpportunityInsert = Omit<OpportunityInsertRaw, "priority_components"> & {
  priority_components?: Record<string, unknown>;
};

export async function getOpportunity(id: string): Promise<OpportunityRow | null> {
  const db = supabaseAdmin();
  const { data, error } = await db.from("seo_opportunities").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function listOpportunitiesForWebsite(websiteId: string): Promise<OpportunityRow[]> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("seo_opportunities")
    .select("*")
    .eq("website_id", websiteId)
    .order("priority_score", { ascending: false });
  if (error) throw error;
  return data;
}

/** Existing open (new/approved) opportunity titles for a website — used for dedupe before inserting AI output. */
export async function listActiveOpportunityTitles(websiteId: string): Promise<string[]> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("seo_opportunities")
    .select("title")
    .eq("website_id", websiteId)
    .in("status", ["new", "approved"]);
  if (error) throw error;
  return data.map((r) => r.title);
}

/**
 * No caller updated seo_opportunities.status before Phase 7 — the admin UI
 * only ever inserts/lists them (status stays 'new' until a detector-level
 * row, e.g. search_performance_opportunities, is separately actioned). The
 * client portal's "Accept"/"Dismiss" buttons are the first real use of this
 * (spec: "Allow authorised users to: review, accept, dismiss").
 */
export async function updateOpportunityStatus(id: string, status: OpportunityStatus): Promise<OpportunityRow> {
  const db = supabaseAdmin();
  const { data, error } = await db.from("seo_opportunities").update({ status }).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

export async function insertOpportunity(input: OpportunityInsert): Promise<OpportunityRow> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("seo_opportunities")
    .insert({ ...input, priority_components: jsonb(input.priority_components ?? {}) })
    .select()
    .single();
  if (error) throw error;
  return data;
}
