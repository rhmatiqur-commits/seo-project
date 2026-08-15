import { supabaseAdmin } from "@/lib/supabase/server";
import type { Database, KeywordSource, KeywordSearchIntent, KeywordMatchType, OpportunityType, OpportunityStatus } from "@/lib/supabase/types";

type KeywordRow = Database["public"]["Tables"]["keywords"]["Row"];
type KeywordMetricsRow = Database["public"]["Tables"]["keyword_metrics"]["Row"];
type KeywordPageMatchRow = Database["public"]["Tables"]["keyword_page_matches"]["Row"];
type KeywordOpportunityRow = Database["public"]["Tables"]["keyword_opportunities"]["Row"];

// ---------------------------------------------------------------------------
// keywords (Phase 1 table, extended in Phase 2B with country/language/search_intent)
// ---------------------------------------------------------------------------

export interface UpsertKeywordInput {
  organizationId: string;
  websiteId: string;
  keyword: string;
  source: KeywordSource;
  /** Free-text notes column from Phase 1 — unused by Phase 2B, kept for compatibility. */
  intent?: string | null;
  searchIntent?: KeywordSearchIntent;
  country?: string;
  language?: string;
}

/** Insert-or-fetch a keyword for a website (unique on website_id+keyword+country+language). */
export async function upsertKeyword(input: UpsertKeywordInput): Promise<KeywordRow> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("keywords")
    .upsert(
      {
        organization_id: input.organizationId,
        website_id: input.websiteId,
        keyword: input.keyword,
        intent: input.intent ?? null,
        search_intent: input.searchIntent ?? "UNKNOWN",
        source: input.source,
        country: input.country ?? "GB",
        language: input.language ?? "en",
      },
      { onConflict: "website_id,keyword,country,language", ignoreDuplicates: false }
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function listKeywordsForWebsite(websiteId: string): Promise<KeywordRow[]> {
  const db = supabaseAdmin();
  const { data, error } = await db.from("keywords").select("*").eq("website_id", websiteId).order("keyword", { ascending: true });
  if (error) throw error;
  return data;
}

export async function linkOpportunityKeyword(opportunityId: string, keywordId: string): Promise<void> {
  const db = supabaseAdmin();
  const { error } = await db
    .from("opportunity_keywords")
    .upsert({ opportunity_id: opportunityId, keyword_id: keywordId });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// keyword_metrics — real provider data only (see lib/keywords/provider.ts).
// No row is ever inserted with fabricated numbers.
// ---------------------------------------------------------------------------

export async function insertKeywordMetrics(input: {
  keywordId: string;
  searchVolume: number | null;
  competition: number | null;
  cpc: number | null;
  metricSource: string;
}): Promise<KeywordMetricsRow> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("keyword_metrics")
    .insert({
      keyword_id: input.keywordId,
      search_volume: input.searchVolume,
      competition: input.competition,
      cpc: input.cpc,
      metric_source: input.metricSource,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------------
// keyword_page_matches
// ---------------------------------------------------------------------------

export async function upsertKeywordPageMatch(input: {
  keywordId: string;
  pageId: string;
  matchType: KeywordMatchType;
  relevanceScore: number;
}): Promise<KeywordPageMatchRow> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("keyword_page_matches")
    .upsert(
      { keyword_id: input.keywordId, page_id: input.pageId, match_type: input.matchType, relevance_score: input.relevanceScore },
      { onConflict: "keyword_id,page_id" }
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------------
// keyword_opportunities — keyword-scoped scoring; promotion into the
// existing seo_opportunities/seo_tasks system happens via promoteKeywordOpportunity.
// ---------------------------------------------------------------------------

export interface UpsertKeywordOpportunityInput {
  organizationId: string;
  websiteId: string;
  keywordId: string;
  currentPageId: string | null;
  opportunityType: OpportunityType;
  businessRelevanceScore: number | null;
  commercialValueScore: number | null;
  difficultyScore: number | null;
  opportunityScore: number;
  recommendedAction: string;
  reasoning: string;
}

export async function upsertKeywordOpportunity(input: UpsertKeywordOpportunityInput): Promise<KeywordOpportunityRow> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("keyword_opportunities")
    .upsert(
      {
        organization_id: input.organizationId,
        website_id: input.websiteId,
        keyword_id: input.keywordId,
        current_page_id: input.currentPageId,
        opportunity_type: input.opportunityType,
        business_relevance_score: input.businessRelevanceScore,
        commercial_value_score: input.commercialValueScore,
        difficulty_score: input.difficultyScore,
        opportunity_score: input.opportunityScore,
        recommended_action: input.recommendedAction,
        reasoning: input.reasoning,
      },
      { onConflict: "website_id,keyword_id" }
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Links a keyword_opportunities row to the seo_opportunities row it was
 * promoted into. A row with seo_opportunity_id already set has already been
 * promoted — callers check this before promoting again, so re-running
 * discovery never creates duplicate tasks for the same keyword. */
export async function markKeywordOpportunityPromoted(id: string, seoOpportunityId: string): Promise<KeywordOpportunityRow> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("keyword_opportunities")
    .update({ seo_opportunity_id: seoOpportunityId })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export interface KeywordOpportunityWithKeyword extends KeywordOpportunityRow {
  keyword: string;
  keyword_source: KeywordSource;
  keyword_search_intent: KeywordSearchIntent;
}

export interface KeywordOpportunityFilters {
  intent?: KeywordSearchIntent;
  action?: OpportunityType;
  status?: OpportunityStatus;
  source?: KeywordSource;
  minScore?: number;
}

/** Joined keyword_opportunities + keywords for the admin UI, with optional filters. */
export async function listKeywordOpportunitiesForWebsite(
  websiteId: string,
  filters: KeywordOpportunityFilters = {}
): Promise<KeywordOpportunityWithKeyword[]> {
  const db = supabaseAdmin();
  let query = db
    .from("keyword_opportunities")
    .select("*, keywords!inner(keyword, source, search_intent)")
    .eq("website_id", websiteId);

  if (filters.action) query = query.eq("opportunity_type", filters.action);
  if (filters.status) query = query.eq("status", filters.status);
  if (typeof filters.minScore === "number") query = query.gte("opportunity_score", filters.minScore);
  if (filters.intent) query = query.eq("keywords.search_intent", filters.intent);
  if (filters.source) query = query.eq("keywords.source", filters.source);

  const { data, error } = await query.order("opportunity_score", { ascending: false });
  if (error) throw error;

  return data.map((row) => {
    const { keywords, ...rest } = row as typeof row & {
      keywords: { keyword: string; source: KeywordSource; search_intent: KeywordSearchIntent };
    };
    return { ...rest, keyword: keywords.keyword, keyword_source: keywords.source, keyword_search_intent: keywords.search_intent };
  });
}

export interface KeywordStats {
  totalKeywords: number;
  keywordsWithMetrics: number;
  keywordsWithPageMatches: number;
  keywordGaps: number; // opportunities with no current_page_id
  highOpportunityCount: number; // opportunities >= PROMOTION_THRESHOLD
  byAction: Record<string, number>;
}

export async function getKeywordStatsForWebsite(websiteId: string, promotionThreshold: number): Promise<KeywordStats> {
  const db = supabaseAdmin();

  const [{ data: keywordRows, error: keywordsError }, { data: opportunityRows, error: opportunitiesError }] = await Promise.all([
    db.from("keywords").select("id").eq("website_id", websiteId),
    db.from("keyword_opportunities").select("opportunity_type, opportunity_score, current_page_id").eq("website_id", websiteId),
  ]);
  if (keywordsError) throw keywordsError;
  if (opportunitiesError) throw opportunitiesError;

  const keywordIds = keywordRows.map((k) => k.id);
  let keywordsWithMetrics = 0;
  let keywordsWithPageMatches = 0;
  if (keywordIds.length > 0) {
    const [metricsRes, matchesRes] = await Promise.all([
      db.from("keyword_metrics").select("keyword_id").in("keyword_id", keywordIds),
      db.from("keyword_page_matches").select("keyword_id").in("keyword_id", keywordIds),
    ]);
    if (metricsRes.error) throw metricsRes.error;
    if (matchesRes.error) throw matchesRes.error;
    keywordsWithMetrics = new Set(metricsRes.data.map((r) => r.keyword_id)).size;
    keywordsWithPageMatches = new Set(matchesRes.data.map((r) => r.keyword_id)).size;
  }

  const byAction: Record<string, number> = {};
  let keywordGaps = 0;
  let highOpportunityCount = 0;
  for (const opp of opportunityRows) {
    byAction[opp.opportunity_type] = (byAction[opp.opportunity_type] ?? 0) + 1;
    if (!opp.current_page_id) keywordGaps++;
    if (opp.opportunity_score >= promotionThreshold) highOpportunityCount++;
  }

  return {
    totalKeywords: keywordRows.length,
    keywordsWithMetrics,
    keywordsWithPageMatches,
    keywordGaps,
    highOpportunityCount,
    byAction,
  };
}
