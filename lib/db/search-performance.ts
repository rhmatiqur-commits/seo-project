import { supabaseAdmin } from "@/lib/supabase/server";
import { jsonb, type Database, type OpportunityStatus, type OpportunityType, type SearchPerformanceDetectorType } from "@/lib/supabase/types";

type OpportunityRow = Database["public"]["Tables"]["search_performance_opportunities"]["Row"];

// ---------------------------------------------------------------------------
// search_performance_opportunities — upserted on (website_id, dedupe_key) so
// re-running ANALYSE_SEARCH_PERFORMANCE updates existing rows (fresh signals/
// score) instead of duplicating them.
// ---------------------------------------------------------------------------

export interface UpsertSearchPerformanceOpportunityInput {
  organizationId: string;
  websiteId: string;
  detectorType: SearchPerformanceDetectorType;
  keywordId: string | null;
  pageId: string | null;
  relatedPageId: string | null;
  dedupeKey: string;
  signals: Record<string, unknown>;
  opportunityScore: number;
  recommendedAction: OpportunityType;
  reasoning: string;
}

export async function upsertSearchPerformanceOpportunity(input: UpsertSearchPerformanceOpportunityInput): Promise<OpportunityRow> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("search_performance_opportunities")
    .upsert(
      {
        organization_id: input.organizationId,
        website_id: input.websiteId,
        detector_type: input.detectorType,
        keyword_id: input.keywordId,
        page_id: input.pageId,
        related_page_id: input.relatedPageId,
        dedupe_key: input.dedupeKey,
        signals: jsonb(input.signals),
        opportunity_score: input.opportunityScore,
        recommended_action: input.recommendedAction,
        reasoning: input.reasoning,
      },
      { onConflict: "website_id,dedupe_key" }
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Not-yet-AI-interpreted opportunities, highest score first — the pool the
 * bounded AI-interpretation pass draws MAX_AI_INTERPRETATIONS_PER_RUN from. */
export async function listUnanalysedSearchPerformanceOpportunities(websiteId: string, limit: number): Promise<OpportunityRow[]> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("search_performance_opportunities")
    .select("*")
    .eq("website_id", websiteId)
    .is("ai_analysed_at", null)
    .order("opportunity_score", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

export async function recordAiInterpretation(id: string, rationale: string, riskNotes: string | null): Promise<void> {
  const db = supabaseAdmin();
  const { error } = await db
    .from("search_performance_opportunities")
    .update({ ai_rationale: rationale, ai_risk_notes: riskNotes, ai_analysed_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

/** Links a row to the seo_opportunities row it was promoted into — a row
 * with seo_opportunity_id already set has already been promoted, checked via
 * shouldPromoteSearchPerformanceOpportunity() before ever calling this. */
export async function markSearchPerformancePromoted(id: string, seoOpportunityId: string): Promise<OpportunityRow> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("search_performance_opportunities")
    .update({ seo_opportunity_id: seoOpportunityId })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** The detector-level row a promoted seo_opportunities row originated from,
 * if any — Phase 1/2B-originated opportunities (no detector pipeline
 * involved) have none. Used by Phase 4's content-brief builder to pull
 * detector_type/signals into the brief when available (see
 * lib/content/build-brief.ts's `detector` field). */
export async function getSearchPerformanceOpportunityBySeoOpportunityId(seoOpportunityId: string): Promise<OpportunityRow | null> {
  const db = supabaseAdmin();
  const { data, error } = await db.from("search_performance_opportunities").select("*").eq("seo_opportunity_id", seoOpportunityId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateSearchPerformanceOpportunityStatus(id: string, status: OpportunityStatus): Promise<OpportunityRow> {
  const db = supabaseAdmin();
  const { data, error } = await db.from("search_performance_opportunities").update({ status }).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

export interface SearchPerformanceOpportunityFilters {
  detectorType?: SearchPerformanceDetectorType;
  status?: OpportunityStatus;
  recommendedAction?: OpportunityType;
  minScore?: number;
}

export async function listSearchPerformanceOpportunitiesForWebsite(
  websiteId: string,
  filters: SearchPerformanceOpportunityFilters = {}
): Promise<OpportunityRow[]> {
  const db = supabaseAdmin();
  let query = db.from("search_performance_opportunities").select("*").eq("website_id", websiteId);

  if (filters.detectorType) query = query.eq("detector_type", filters.detectorType);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.recommendedAction) query = query.eq("recommended_action", filters.recommendedAction);
  if (typeof filters.minScore === "number") query = query.gte("opportunity_score", filters.minScore);

  const { data, error } = await query.order("opportunity_score", { ascending: false });
  if (error) throw error;
  return data;
}

export interface SearchPerformanceStats {
  totalOpportunities: number;
  byDetector: Record<string, number>;
  promotedCount: number;
  highScoreCount: number;
}

export async function getSearchPerformanceStatsForWebsite(websiteId: string, promotionThreshold: number): Promise<SearchPerformanceStats> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("search_performance_opportunities")
    .select("detector_type, opportunity_score, seo_opportunity_id")
    .eq("website_id", websiteId);
  if (error) throw error;

  const byDetector: Record<string, number> = {};
  let promotedCount = 0;
  let highScoreCount = 0;
  for (const row of data) {
    byDetector[row.detector_type] = (byDetector[row.detector_type] ?? 0) + 1;
    if (row.seo_opportunity_id) promotedCount++;
    if (row.opportunity_score >= promotionThreshold) highScoreCount++;
  }

  return { totalOpportunities: data.length, byDetector, promotedCount, highScoreCount };
}
