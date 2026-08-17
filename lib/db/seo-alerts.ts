import { supabaseAdmin } from "@/lib/supabase/server";
import { jsonb, type Database, type SeoAlertSeverity, type SeoAlertType } from "@/lib/supabase/types";

type SeoAlertRow = Database["public"]["Tables"]["seo_alerts"]["Row"];

/**
 * seo_alerts — internal notifications, only ever created when
 * lib/outcomes/alerts.ts's evaluateAlertCandidates crosses a configurable
 * threshold. Deduplicated per (seo_action_outcome_id, alert_type) via the DB's
 * own unique index (migration 0021) — insertAlert below relies on
 * `ignoreDuplicates` rather than a pre-check, so it's safe to call every run
 * without any extra "does this already exist" query.
 */

export interface InsertAlertInput {
  organizationId: string;
  websiteId: string;
  seoActionId: string | null;
  seoActionOutcomeId: string | null;
  alertType: SeoAlertType;
  severity: SeoAlertSeverity;
  message: string;
  details?: Record<string, unknown>;
}

/** Returns the inserted row, or null if an alert of this type already exists
 * for this outcome (the dedup constraint silently no-ops the insert —
 * "do not spam users" by construction, not by an extra check here). */
export async function insertAlertIfNotExists(input: InsertAlertInput): Promise<SeoAlertRow | null> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("seo_alerts")
    .upsert(
      {
        organization_id: input.organizationId,
        website_id: input.websiteId,
        seo_action_id: input.seoActionId,
        seo_action_outcome_id: input.seoActionOutcomeId,
        alert_type: input.alertType,
        severity: input.severity,
        message: input.message,
        details: jsonb(input.details ?? {}),
      },
      { onConflict: "seo_action_outcome_id,alert_type", ignoreDuplicates: true }
    )
    .select()
    .maybeSingle();
  if (error) throw error;
  return data;
}

export interface SeoAlertFilters {
  status?: "open" | "acknowledged";
}

export async function listAlertsForWebsite(websiteId: string, filters: SeoAlertFilters = {}, limit = 50): Promise<SeoAlertRow[]> {
  const db = supabaseAdmin();
  let query = db.from("seo_alerts").select("*").eq("website_id", websiteId);
  if (filters.status) query = query.eq("status", filters.status);
  const { data, error } = await query.order("created_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return data;
}

export async function acknowledgeAlert(id: string): Promise<SeoAlertRow> {
  const db = supabaseAdmin();
  const { data, error } = await db.from("seo_alerts").update({ status: "acknowledged", acknowledged_at: new Date().toISOString() }).eq("id", id).select().single();
  if (error) throw error;
  return data;
}
