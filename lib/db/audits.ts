import { supabaseAdmin } from "@/lib/supabase/server";
import { jsonb, type Database } from "@/lib/supabase/types";

type AuditRow = Database["public"]["Tables"]["seo_audits"]["Row"];
type AuditInsert = Database["public"]["Tables"]["seo_audits"]["Insert"];
type IssueInsertRaw = Database["public"]["Tables"]["seo_issues"]["Insert"];
type IssueInsert = Omit<IssueInsertRaw, "detected_data"> & { detected_data?: Record<string, unknown> };

export async function createAudit(input: AuditInsert): Promise<AuditRow> {
  const db = supabaseAdmin();
  const { data, error } = await db.from("seo_audits").insert(input).select().single();
  if (error) throw error;
  return data;
}

export async function completeAudit(
  id: string,
  patch: { pages_analyzed: number; issues_found: number; summary: Record<string, unknown> }
): Promise<AuditRow> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("seo_audits")
    .update({ ...patch, summary: jsonb(patch.summary), status: "COMPLETED", completed_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function insertIssues(issues: IssueInsert[]): Promise<void> {
  if (issues.length === 0) return;
  const db = supabaseAdmin();
  const { error } = await db
    .from("seo_issues")
    .insert(issues.map((i) => ({ ...i, detected_data: jsonb(i.detected_data ?? {}) })));
  if (error) throw error;
}

export async function listIssuesForWebsite(websiteId: string) {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("seo_issues")
    .select("*")
    .eq("website_id", websiteId)
    .eq("status", "open")
    .order("severity", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function getLatestAudit(websiteId: string): Promise<AuditRow | null> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("seo_audits")
    .select("*")
    .eq("website_id", websiteId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}
