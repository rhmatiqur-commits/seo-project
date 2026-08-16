import { supabaseAdmin } from "@/lib/supabase/server";
import { jsonb, type Database } from "@/lib/supabase/types";

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
