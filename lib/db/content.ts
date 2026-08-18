import { supabaseAdmin } from "@/lib/supabase/server";
import { jsonb, type Database, type ContentBriefStatus, type ContentPipelineStatus, type ContentQaStatus, type OpportunityType } from "@/lib/supabase/types";

type ContentBriefRow = Database["public"]["Tables"]["content_briefs"]["Row"];
type ContentJobRow = Database["public"]["Tables"]["content_jobs"]["Row"];
type ContentVersionRow = Database["public"]["Tables"]["content_versions"]["Row"];
type ContentQaResultRow = Database["public"]["Tables"]["content_qa_results"]["Row"];

// ---------------------------------------------------------------------------
// content_briefs
// ---------------------------------------------------------------------------

export interface CreateContentBriefInput {
  organizationId: string;
  websiteId: string;
  seoOpportunityId: string;
  seoTaskId: string | null;
  primaryKeywordId: string | null;
  primaryKeyword: string | null;
  searchIntent: string | null;
  targetUrl: string | null;
  contentType: OpportunityType;
  briefData: Record<string, unknown>;
}

export async function insertContentBrief(input: CreateContentBriefInput): Promise<ContentBriefRow> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("content_briefs")
    .insert({
      organization_id: input.organizationId,
      website_id: input.websiteId,
      seo_opportunity_id: input.seoOpportunityId,
      seo_task_id: input.seoTaskId,
      primary_keyword_id: input.primaryKeywordId,
      primary_keyword: input.primaryKeyword,
      search_intent: input.searchIntent,
      target_url: input.targetUrl,
      content_type: input.contentType,
      brief_data: jsonb(input.briefData),
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getContentBrief(id: string): Promise<ContentBriefRow | null> {
  const db = supabaseAdmin();
  const { data, error } = await db.from("content_briefs").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function listContentBriefsForWebsite(websiteId: string, limit = 50): Promise<ContentBriefRow[]> {
  const db = supabaseAdmin();
  const { data, error } = await db.from("content_briefs").select("*").eq("website_id", websiteId).order("created_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return data;
}

export async function updateContentBriefStatus(id: string, status: ContentBriefStatus): Promise<ContentBriefRow> {
  const db = supabaseAdmin();
  const { data, error } = await db.from("content_briefs").update({ status }).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------------
// content_jobs — one row per content_brief's generation effort. See
// lib/content/state-machine.ts for the legal status transitions.
// ---------------------------------------------------------------------------

export async function insertContentJob(input: { organizationId: string; websiteId: string; contentBriefId: string; provider: string }): Promise<ContentJobRow> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("content_jobs")
    .insert({ organization_id: input.organizationId, website_id: input.websiteId, content_brief_id: input.contentBriefId, provider: input.provider })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getContentJob(id: string): Promise<ContentJobRow | null> {
  const db = supabaseAdmin();
  const { data, error } = await db.from("content_jobs").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function listContentJobsForBrief(contentBriefId: string): Promise<ContentJobRow[]> {
  const db = supabaseAdmin();
  const { data, error } = await db.from("content_jobs").select("*").eq("content_brief_id", contentBriefId).order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

/** Every content_job for a website (Phase 7's client Content page /
 * dashboard home "pending approvals" count) — content_jobs has no direct
 * website_id-scoped query before this since every prior caller worked from
 * one specific brief. */
export async function listContentJobsForWebsite(websiteId: string, status?: ContentPipelineStatus): Promise<ContentJobRow[]> {
  const db = supabaseAdmin();
  let query = db.from("content_jobs").select("*").eq("website_id", websiteId);
  if (status) query = query.eq("status", status);
  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

/** A brief is only available for a fresh "Generate content" click if it has
 * no non-terminal content_jobs row already — this is the DB half of
 * duplicate-generation prevention (the other half is jobs.idempotency_key). */
export async function findActiveContentJobForBrief(contentBriefId: string): Promise<ContentJobRow | null> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("content_jobs")
    .select("*")
    .eq("content_brief_id", contentBriefId)
    .not("status", "in", "(APPROVED,REJECTED)")
    .order("created_at", { ascending: false })
    .maybeSingle();
  if (error) throw error;
  return data;
}

export interface UpdateContentJobStatusPatch {
  error?: string | null;
  attempts?: number;
  startedAt?: string | null;
  completedAt?: string | null;
}

export async function updateContentJobStatus(id: string, status: ContentPipelineStatus, patch: UpdateContentJobStatusPatch = {}): Promise<ContentJobRow> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("content_jobs")
    .update({
      status,
      ...(patch.error !== undefined ? { error: patch.error } : {}),
      ...(patch.attempts !== undefined ? { attempts: patch.attempts } : {}),
      ...(patch.startedAt !== undefined ? { started_at: patch.startedAt } : {}),
      ...(patch.completedAt !== undefined ? { completed_at: patch.completedAt } : {}),
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------------
// content_versions — every draft/revision, never overwritten.
// ---------------------------------------------------------------------------

export interface InsertContentVersionInput {
  organizationId: string;
  websiteId: string;
  contentBriefId: string;
  contentJobId: string;
  versionNumber: number;
  title: string | null;
  content: string;
  metadata: Record<string, unknown>;
}

export async function insertContentVersion(input: InsertContentVersionInput): Promise<ContentVersionRow> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("content_versions")
    .insert({
      organization_id: input.organizationId,
      website_id: input.websiteId,
      content_brief_id: input.contentBriefId,
      content_job_id: input.contentJobId,
      version_number: input.versionNumber,
      title: input.title,
      content: input.content,
      metadata: jsonb(input.metadata),
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getLatestContentVersionForBrief(contentBriefId: string): Promise<ContentVersionRow | null> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("content_versions")
    .select("*")
    .eq("content_brief_id", contentBriefId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** The latest version produced by a specific content_job (as opposed to
 * getLatestContentVersionForBrief, which is the brief's latest version
 * across every content_job attempt) — used by Phase 5's approveContentAction
 * to log an audit event against the exact version that was just approved. */
export async function getLatestContentVersionForJob(contentJobId: string): Promise<ContentVersionRow | null> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("content_versions")
    .select("*")
    .eq("content_job_id", contentJobId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getContentVersionById(id: string): Promise<ContentVersionRow | null> {
  const db = supabaseAdmin();
  const { data, error } = await db.from("content_versions").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function listContentVersionsForBrief(contentBriefId: string): Promise<ContentVersionRow[]> {
  const db = supabaseAdmin();
  const { data, error } = await db.from("content_versions").select("*").eq("content_brief_id", contentBriefId).order("version_number", { ascending: true });
  if (error) throw error;
  return data;
}

export async function updateContentVersionQaStatus(id: string, qaStatus: ContentQaStatus): Promise<ContentVersionRow> {
  const db = supabaseAdmin();
  const { data, error } = await db.from("content_versions").update({ qa_status: qaStatus }).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------------
// content_qa_results — the full deterministic+AI breakdown for one version.
// ---------------------------------------------------------------------------

export interface InsertContentQaResultInput {
  organizationId: string;
  websiteId: string;
  contentVersionId: string;
  aiJobId: string | null;
  passed: boolean;
  score: number;
  deterministicChecks: Record<string, unknown>[];
  aiFeedback: Record<string, unknown> | null;
  issues: Record<string, unknown>[];
  model: string | null;
  promptVersion: string | null;
}

export async function insertContentQaResult(input: InsertContentQaResultInput): Promise<ContentQaResultRow> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("content_qa_results")
    .insert({
      organization_id: input.organizationId,
      website_id: input.websiteId,
      content_version_id: input.contentVersionId,
      ai_job_id: input.aiJobId,
      passed: input.passed,
      score: input.score,
      deterministic_checks: jsonb(input.deterministicChecks),
      ai_feedback: jsonb(input.aiFeedback),
      issues: jsonb(input.issues),
      model: input.model,
      prompt_version: input.promptVersion,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getLatestQaResultForVersion(contentVersionId: string): Promise<ContentQaResultRow | null> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("content_qa_results")
    .select("*")
    .eq("content_version_id", contentVersionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listQaResultsForBrief(contentBriefId: string): Promise<ContentQaResultRow[]> {
  const db = supabaseAdmin();
  const { data: versions, error: versionsError } = await db.from("content_versions").select("id").eq("content_brief_id", contentBriefId);
  if (versionsError) throw versionsError;
  const versionIds = versions.map((v) => v.id);
  if (versionIds.length === 0) return [];
  const { data, error } = await db.from("content_qa_results").select("*").in("content_version_id", versionIds).order("created_at", { ascending: true });
  if (error) throw error;
  return data;
}
