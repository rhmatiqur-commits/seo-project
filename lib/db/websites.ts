import { supabaseAdmin } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type WebsiteRow = Database["public"]["Tables"]["websites"]["Row"];
type WebsiteInsert = Database["public"]["Tables"]["websites"]["Insert"];

export async function createWebsite(input: WebsiteInsert): Promise<WebsiteRow> {
  const db = supabaseAdmin();
  const { data, error } = await db.from("websites").insert(input).select().single();
  if (error) throw error;
  return data;
}

export async function listWebsitesForOrganization(organizationId: string): Promise<WebsiteRow[]> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("websites")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function getWebsite(id: string): Promise<WebsiteRow | null> {
  const db = supabaseAdmin();
  const { data, error } = await db.from("websites").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateWebsite(
  id: string,
  patch: Database["public"]["Tables"]["websites"]["Update"]
): Promise<WebsiteRow> {
  const db = supabaseAdmin();
  const { data, error } = await db.from("websites").update(patch).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

/** Every active website — the scheduler filters this down to due ones with
 * lib/jobs/policy.ts's isDueForCrawl, rather than duplicating the "due" math
 * in SQL (small scale, and keeps one tested source of truth for the logic). */
export async function listActiveWebsites(): Promise<WebsiteRow[]> {
  const db = supabaseAdmin();
  const { data, error } = await db.from("websites").select("*").eq("status", "active");
  if (error) throw error;
  return data;
}

export async function listAllWebsitesForAutomation(): Promise<WebsiteRow[]> {
  const db = supabaseAdmin();
  const { data, error } = await db.from("websites").select("*").order("name", { ascending: true });
  if (error) throw error;
  return data;
}
