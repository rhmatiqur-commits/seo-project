import { supabaseAdmin } from "@/lib/supabase/server";
import { jsonb, type Database, type OutcomeClassification, type PageLifecycleStage } from "@/lib/supabase/types";

type OutcomeRow = Database["public"]["Tables"]["seo_action_outcomes"]["Row"];

/**
 * seo_action_outcomes — one row per (seo_action, measurement_window_days),
 * upserted on that pair so re-running ANALYSE_ACTION_OUTCOMES before a
 * window's data has meaningfully changed just refreshes the same row rather
 * than duplicating it (mirrors search_performance_opportunities' dedupe-key
 * upsert, using a real composite unique constraint here since — unlike that
 * table — identity doesn't vary by "detector" and NULLs aren't involved).
 */

export interface UpsertSeoActionOutcomeInput {
  organizationId: string;
  websiteId: string;
  seoActionId: string;
  measurementWindowDays: number;
  windowStart: string;
  windowEnd: string;
  baselineMetrics: Record<string, unknown>;
  currentMetrics: Record<string, unknown>;
  deltas: Record<string, unknown>;
  dataSufficient: boolean;
  classification: OutcomeClassification;
  classificationReasoning: string;
  recommendation: Database["public"]["Enums"]["outcome_recommendation"];
  pageLifecycleStage: PageLifecycleStage | null;
}

export async function upsertSeoActionOutcome(input: UpsertSeoActionOutcomeInput): Promise<OutcomeRow> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("seo_action_outcomes")
    .upsert(
      {
        organization_id: input.organizationId,
        website_id: input.websiteId,
        seo_action_id: input.seoActionId,
        measurement_window_days: input.measurementWindowDays,
        window_start: input.windowStart,
        window_end: input.windowEnd,
        baseline_metrics: jsonb(input.baselineMetrics),
        current_metrics: jsonb(input.currentMetrics),
        deltas: jsonb(input.deltas),
        data_sufficient: input.dataSufficient,
        classification: input.classification,
        classification_reasoning: input.classificationReasoning,
        recommendation: input.recommendation,
        page_lifecycle_stage: input.pageLifecycleStage,
        computed_at: new Date().toISOString(),
      },
      { onConflict: "seo_action_id,measurement_window_days" }
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getSeoActionOutcome(seoActionId: string, measurementWindowDays: number): Promise<OutcomeRow | null> {
  const db = supabaseAdmin();
  const { data, error } = await db.from("seo_action_outcomes").select("*").eq("seo_action_id", seoActionId).eq("measurement_window_days", measurementWindowDays).maybeSingle();
  if (error) throw error;
  return data;
}

/** All outcome rows for one action, every window computed so far, ascending by window. */
export async function listOutcomesForAction(seoActionId: string): Promise<OutcomeRow[]> {
  const db = supabaseAdmin();
  const { data, error } = await db.from("seo_action_outcomes").select("*").eq("seo_action_id", seoActionId).order("measurement_window_days", { ascending: true });
  if (error) throw error;
  return data;
}

/** The most recently computed outcome for an action (any window) — what the
 * dashboard's "current status" column and the lifecycle-staging comparison
 * (this window vs the *previous* window, not the baseline) read. */
export async function getLatestOutcomeForAction(seoActionId: string): Promise<OutcomeRow | null> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("seo_action_outcomes")
    .select("*")
    .eq("seo_action_id", seoActionId)
    .order("measurement_window_days", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export interface SeoActionOutcomeFilters {
  classification?: OutcomeClassification;
}

export async function listOutcomesForWebsite(websiteId: string, filters: SeoActionOutcomeFilters = {}, limit = 100): Promise<OutcomeRow[]> {
  const db = supabaseAdmin();
  let query = db.from("seo_action_outcomes").select("*").eq("website_id", websiteId);
  if (filters.classification) query = query.eq("classification", filters.classification);
  const { data, error } = await query.order("computed_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return data;
}

/** Not-yet-AI-interpreted outcome rows, most recently computed first — the
 * pool the bounded AI-interpretation pass draws MAX_AI_INTERPRETATIONS_PER_RUN
 * from (mirrors search-performance's listUnanalysedSearchPerformanceOpportunities). */
export async function listUnanalysedOutcomesForWebsite(websiteId: string, limit: number): Promise<OutcomeRow[]> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("seo_action_outcomes")
    .select("*")
    .eq("website_id", websiteId)
    .is("ai_analysed_at", null)
    .order("computed_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

export async function recordOutcomeAiInterpretation(id: string, interpretation: string, riskNotes: string | null): Promise<void> {
  const db = supabaseAdmin();
  const { error } = await db
    .from("seo_action_outcomes")
    .update({ ai_interpretation: interpretation, ai_risk_notes: riskNotes, ai_analysed_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

/** Duplicate-follow-up-task prevention (spec section 15): set once a
 * seo_tasks row has been created from this outcome, checked via
 * lib/outcomes/follow-up.ts's shouldCreateFollowUpTask before ever calling
 * this — re-running analysis on the same outcome never creates a second task. */
export async function markOutcomeFollowUpTaskCreated(id: string, followUpTaskId: string): Promise<OutcomeRow> {
  const db = supabaseAdmin();
  const { data, error } = await db.from("seo_action_outcomes").update({ follow_up_task_id: followUpTaskId }).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

/** The most recently computed outcome (highest measurement_window_days) per
 * action, for every action on this website — one query instead of N (one per
 * action), used by the dashboard's action-outcomes table and new-page
 * lifecycle section. */
export async function listLatestOutcomesByActionForWebsite(websiteId: string): Promise<Map<string, OutcomeRow>> {
  const db = supabaseAdmin();
  const { data, error } = await db.from("seo_action_outcomes").select("*").eq("website_id", websiteId).order("measurement_window_days", { ascending: true });
  if (error) throw error;

  const latestByAction = new Map<string, OutcomeRow>();
  for (const row of data) {
    latestByAction.set(row.seo_action_id, row); // ascending order means the last write per key is the highest window
  }
  return latestByAction;
}

export interface SeoActionOutcomeStats {
  totalOutcomes: number;
  byClassification: Record<string, number>;
  actionsNeedingAttention: number;
}

/** "Actions needing attention" = latest-known-outcome classification is
 * NEGATIVE or MIXED — used by the dashboard overview (spec section 17). Not
 * a live query per action (would be N+1); instead reads every outcome row
 * for the website and keeps only the highest-window (most recent) row per
 * action in application code, same "small scale, revisit with a real
 * aggregate query later" honesty as lib/db/jobs.ts's getJobStats. */
export async function getSeoActionOutcomeStatsForWebsite(websiteId: string): Promise<SeoActionOutcomeStats> {
  const db = supabaseAdmin();
  const { data, error } = await db.from("seo_action_outcomes").select("seo_action_id, measurement_window_days, classification").eq("website_id", websiteId);
  if (error) throw error;

  const byClassification: Record<string, number> = {};
  const latestWindowByAction = new Map<string, number>();
  const latestClassificationByAction = new Map<string, string>();
  for (const row of data) {
    byClassification[row.classification] = (byClassification[row.classification] ?? 0) + 1;
    const known = latestWindowByAction.get(row.seo_action_id) ?? -1;
    if (row.measurement_window_days > known) {
      latestWindowByAction.set(row.seo_action_id, row.measurement_window_days);
      latestClassificationByAction.set(row.seo_action_id, row.classification);
    }
  }
  let actionsNeedingAttention = 0;
  for (const classification of latestClassificationByAction.values()) {
    if (classification === "NEGATIVE" || classification === "MIXED") actionsNeedingAttention++;
  }

  return { totalOutcomes: data.length, byClassification, actionsNeedingAttention };
}
