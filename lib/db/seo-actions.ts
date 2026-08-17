import { supabaseAdmin } from "@/lib/supabase/server";
import { jsonb, type Database, type SeoActionStatus, type SeoActionType } from "@/lib/supabase/types";

type SeoActionRow = Database["public"]["Tables"]["seo_actions"]["Row"];

/**
 * seo_actions — the Phase 6 traceability spine connecting an executed SEO
 * action back to the opportunity/task/content chain that produced it (see
 * migration 0021's header comment). Every insert here is the moment an
 * action becomes measurable — either lib/jobs/handlers/publish-content.ts
 * (content actions, on PUBLISHED) or app/admin/actions.ts's
 * updateTaskStatusAction (non-content actions, on a task marked completed).
 */

export interface InsertSeoActionInput {
  organizationId: string;
  websiteId: string;
  seoOpportunityId: string | null;
  seoTaskId: string | null;
  contentBriefId?: string | null;
  contentVersionId?: string | null;
  contentPublicationId?: string | null;
  actionType: SeoActionType;
  targetUrl: string | null;
  targetKeywordId: string | null;
  targetKeywordText: string | null;
  /** Defaults to now() at insert time — the moment the underlying change went live. */
  executedAt?: string;
}

export async function insertSeoAction(input: InsertSeoActionInput): Promise<SeoActionRow> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("seo_actions")
    .insert({
      organization_id: input.organizationId,
      website_id: input.websiteId,
      seo_opportunity_id: input.seoOpportunityId,
      seo_task_id: input.seoTaskId,
      content_brief_id: input.contentBriefId ?? null,
      content_version_id: input.contentVersionId ?? null,
      content_publication_id: input.contentPublicationId ?? null,
      action_type: input.actionType,
      status: "EXECUTED",
      target_url: input.targetUrl,
      target_keyword_id: input.targetKeywordId,
      target_keyword_text: input.targetKeywordText,
      executed_at: input.executedAt ?? new Date().toISOString(),
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getSeoAction(id: string): Promise<SeoActionRow | null> {
  const db = supabaseAdmin();
  const { data, error } = await db.from("seo_actions").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

/** Duplicate-prevention for the publish-completion hook — a content_publication
 * has at most one seo_action (mirrors the DB's own partial unique index). */
export async function getSeoActionForContentPublication(contentPublicationId: string): Promise<SeoActionRow | null> {
  const db = supabaseAdmin();
  const { data, error } = await db.from("seo_actions").select("*").eq("content_publication_id", contentPublicationId).maybeSingle();
  if (error) throw error;
  return data;
}

/** Duplicate-prevention for the task-completion hook (non-content actions —
 * TECHNICAL_FIX, IMPROVE_INTERNAL_LINKING, etc.). Not DB-enforced by a unique
 * index (a task could in principle have more than one action across its
 * lifetime), so this is checked before every insert from that path. */
export async function getSeoActionForTask(seoTaskId: string): Promise<SeoActionRow | null> {
  const db = supabaseAdmin();
  const { data, error } = await db.from("seo_actions").select("*").eq("seo_task_id", seoTaskId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data;
}

export interface UpdateSeoActionBaselinePatch {
  baselineWindowDays: number;
  baselineStartDate: string;
  baselineEndDate: string;
  baselineMetrics: Record<string, unknown>;
}

/** Captures the baseline snapshot exactly once — callers must check
 * baseline_captured_at is still null before calling this (see
 * lib/jobs/handlers/analyse-action-outcomes.ts), so "pre-action data" never
 * gets silently overwritten by a later run. */
export async function captureSeoActionBaseline(id: string, patch: UpdateSeoActionBaselinePatch): Promise<SeoActionRow> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("seo_actions")
    .update({
      baseline_captured_at: new Date().toISOString(),
      baseline_window_days: patch.baselineWindowDays,
      baseline_start_date: patch.baselineStartDate,
      baseline_end_date: patch.baselineEndDate,
      baseline_metrics: jsonb(patch.baselineMetrics),
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export interface SeoActionFilters {
  status?: SeoActionStatus;
  actionType?: SeoActionType;
}

export async function listSeoActionsForWebsite(websiteId: string, filters: SeoActionFilters = {}, limit = 100): Promise<SeoActionRow[]> {
  const db = supabaseAdmin();
  let query = db.from("seo_actions").select("*").eq("website_id", websiteId);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.actionType) query = query.eq("action_type", filters.actionType);
  const { data, error } = await query.order("executed_at", { ascending: false, nullsFirst: false }).limit(limit);
  if (error) throw error;
  return data;
}

/** Executed actions for a website — the pool
 * lib/jobs/handlers/analyse-action-outcomes.ts iterates to decide what needs
 * baseline capture and/or a due measurement window. */
export async function listExecutedSeoActionsForWebsite(websiteId: string): Promise<SeoActionRow[]> {
  const db = supabaseAdmin();
  const { data, error } = await db.from("seo_actions").select("*").eq("website_id", websiteId).eq("status", "EXECUTED").not("executed_at", "is", null);
  if (error) throw error;
  return data;
}

export interface SeoActionStats {
  totalActions: number;
  byActionType: Record<string, number>;
  byStatus: Record<string, number>;
}

export async function getSeoActionStatsForWebsite(websiteId: string): Promise<SeoActionStats> {
  const db = supabaseAdmin();
  const { data, error } = await db.from("seo_actions").select("action_type, status").eq("website_id", websiteId);
  if (error) throw error;

  const byActionType: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  for (const row of data) {
    byActionType[row.action_type] = (byActionType[row.action_type] ?? 0) + 1;
    byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
  }
  return { totalActions: data.length, byActionType, byStatus };
}
