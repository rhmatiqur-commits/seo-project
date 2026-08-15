import { getWebsite } from "@/lib/db/websites";
import { listPagesForWebsite, listLinksForWebsite } from "@/lib/db/pages";
import { listKeywordsForWebsite, listKeywordOpportunitiesForWebsite, listLatestKeywordSearchVolumes } from "@/lib/db/keywords";
import { listSearchConsoleMetricsForWebsiteInRange, getSearchConsoleStatsForWebsite } from "@/lib/db/search-console";
import { upsertSearchPerformanceOpportunity, listUnanalysedSearchPerformanceOpportunities, recordAiInterpretation, markSearchPerformancePromoted } from "@/lib/db/search-performance";
import { insertOpportunity } from "@/lib/db/opportunities";
import { insertTask } from "@/lib/db/tasks";
import { createAiJob, completeAiJob } from "@/lib/db/ai-jobs";
import { getAIProvider } from "@/lib/ai/get-provider";
import { searchPerformanceInterpretationSchema, searchPerformanceInterpretationJsonSchema } from "@/lib/ai/schemas";
import { SEARCH_PERFORMANCE_PROMPT_VERSION, SEARCH_PERFORMANCE_SYSTEM_PROMPT, buildSearchPerformanceUserPrompt } from "@/lib/ai/prompts/search-performance";
import { normalizeKeyword } from "@/lib/keywords/normalize";
import { aggregateByQuery, comparePeriods } from "@/lib/search-performance/comparison";
import { computeSearchPerformanceScore, getEffortForAction, shouldPromoteSearchPerformanceOpportunity } from "@/lib/search-performance/scoring";
import { buildDedupeKey } from "@/lib/search-performance/dedupe-key";
import { DEFAULT_COMPARISON_WINDOW_DAYS, EXTENDED_COMPARISON_WINDOW_DAYS, MAX_AI_INTERPRETATIONS_PER_RUN, MAX_PROMOTIONS_PER_RUN } from "@/lib/search-performance/limits";
import { detectPageTwoOpportunities } from "@/lib/search-performance/detectors/page-two";
import { detectHighImpressionsLowCtr } from "@/lib/search-performance/detectors/low-ctr";
import { detectMissingPages, type KeywordForMissingPage } from "@/lib/search-performance/detectors/missing-page";
import { detectDecliningKeywords } from "@/lib/search-performance/detectors/declining-keyword";
import { detectEmergingKeywords } from "@/lib/search-performance/detectors/emerging-keyword";
import { detectContentGaps, type KeywordOpportunityForContentGap } from "@/lib/search-performance/detectors/content-gap";
import { detectInternalLinkOpportunities, type KeywordForInternalLink } from "@/lib/search-performance/detectors/internal-link";
import type { PageForMatching, SearchPerformanceCandidate } from "@/lib/search-performance/types";
import type { JobHandler } from "@/lib/jobs/types";
import type { Database, OpportunityEffort } from "@/lib/supabase/types";

type SearchPerformanceOpportunityRow = Database["public"]["Tables"]["search_performance_opportunities"]["Row"];

export interface AnalyseSearchPerformanceResult {
  candidatesDetected: number;
  aiInterpreted: number;
  opportunitiesPromoted: number;
  comparisonWindowDays: number;
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** 7 days by default; opportunistically 28-vs-28 once the connection has
 * synced enough history for that to be meaningful (>= 2 full windows). */
async function pickComparisonWindowDays(websiteId: string): Promise<number> {
  const stats = await getSearchConsoleStatsForWebsite(websiteId);
  if (!stats.earliestDate) return DEFAULT_COMPARISON_WINDOW_DAYS;
  const daysOfHistory = (Date.now() - new Date(stats.earliestDate).getTime()) / (24 * 60 * 60 * 1000);
  return daysOfHistory >= EXTENDED_COMPARISON_WINDOW_DAYS * 2 ? EXTENDED_COMPARISON_WINDOW_DAYS : DEFAULT_COMPARISON_WINDOW_DAYS;
}

function effortLevel(effort: number): OpportunityEffort {
  if (effort <= 2) return "low";
  if (effort >= 4) return "high";
  return "medium";
}

export const handleAnalyseSearchPerformance: JobHandler = async ({ job }) => {
  if (!job.website_id) throw new Error("ANALYSE_SEARCH_PERFORMANCE job is missing website_id");
  const website = await getWebsite(job.website_id);
  if (!website) throw new Error(`Website ${job.website_id} not found`);

  const [pages, links, keywords, keywordOpportunities] = await Promise.all([
    listPagesForWebsite(website.id),
    listLinksForWebsite(website.id),
    listKeywordsForWebsite(website.id),
    listKeywordOpportunitiesForWebsite(website.id),
  ]);

  const pagesForMatching: PageForMatching[] = pages.map((p) => ({
    id: p.id,
    url: p.url,
    title: p.title,
    h1: p.h1,
    headings: p.headings.map((h) => h.text),
    metaDescription: p.meta_description,
  }));
  const pageIdByUrl = new Map(pages.map((p) => [p.url, p.id]));
  const keywordIdByNormalizedQuery = new Map(keywords.map((k) => [normalizeKeyword(k.keyword), k.id]));
  const keywordTextById = new Map(keywords.map((k) => [k.id, k.keyword]));
  const pageUrlById = new Map(pages.map((p) => [p.id, p.url]));

  const existingLinks = new Set(links.filter((l) => l.is_internal && l.target_page_id).map((l) => `${l.source_page_id}->${l.target_page_id}`));

  // --- Historical comparison (real Search Console data only; gracefully empty if none synced yet) ---
  const comparisonWindowDays = await pickComparisonWindowDays(website.id);
  const now = new Date();
  const currentStart = new Date(now.getTime() - comparisonWindowDays * 24 * 60 * 60 * 1000);
  const previousEnd = new Date(currentStart.getTime() - 24 * 60 * 60 * 1000);
  const previousStart = new Date(previousEnd.getTime() - comparisonWindowDays * 24 * 60 * 60 * 1000);

  const [currentRows, previousRows] = await Promise.all([
    listSearchConsoleMetricsForWebsiteInRange(website.id, toIsoDate(currentStart), toIsoDate(now)),
    listSearchConsoleMetricsForWebsiteInRange(website.id, toIsoDate(previousStart), toIsoDate(previousEnd)),
  ]);
  const currentAggregates = Array.from(aggregateByQuery(currentRows).values());
  const currentAggregateByNormalizedQuery = aggregateByQuery(currentRows);
  const comparisons = comparePeriods(currentRows, previousRows);

  // --- Demand evidence for MISSING_PAGE (real provider data only) ---
  const searchVolumeByKeywordId = await listLatestKeywordSearchVolumes(keywords.map((k) => k.id));
  const keywordsForMissingPage: KeywordForMissingPage[] = keywords.map((k) => ({
    id: k.id,
    keyword: k.keyword,
    searchVolume: searchVolumeByKeywordId.get(k.id) ?? null,
  }));

  const contentGapInput: KeywordOpportunityForContentGap[] = keywordOpportunities.map((ko) => ({
    id: ko.id,
    keywordId: ko.keyword_id,
    keyword: ko.keyword,
    opportunityType: ko.opportunity_type,
    currentPageId: ko.current_page_id,
    businessRelevanceScore: ko.business_relevance_score,
    commercialValueScore: ko.commercial_value_score,
    seoOpportunityId: ko.seo_opportunity_id,
  }));

  const keywordsForInternalLink: KeywordForInternalLink[] = keywords.map((k) => ({ id: k.id, keyword: k.keyword }));

  // --- Run all 7 deterministic detectors ---
  const candidates: SearchPerformanceCandidate[] = [
    ...detectPageTwoOpportunities(currentAggregates, keywordIdByNormalizedQuery, pagesForMatching),
    ...detectHighImpressionsLowCtr(currentAggregates, keywordIdByNormalizedQuery, pageIdByUrl),
    ...detectMissingPages(keywordsForMissingPage, currentAggregateByNormalizedQuery, pagesForMatching),
    ...detectDecliningKeywords(comparisons, keywordIdByNormalizedQuery),
    ...detectEmergingKeywords(comparisons, keywordIdByNormalizedQuery),
    ...detectContentGaps(contentGapInput),
    ...detectInternalLinkOpportunities(keywordsForInternalLink, pagesForMatching, existingLinks),
  ];

  // businessRelevance/commercialValue come from a matched keyword_opportunities
  // row (Phase 2B's AI judgement, reused) when one exists, default 3 (neutral)
  // otherwise — never a fresh AI call just to score (see scoring.ts).
  const relevanceByKeywordId = new Map(
    keywordOpportunities.map((ko) => [ko.keyword_id, { businessRelevance: ko.business_relevance_score ?? 3, commercialValue: ko.commercial_value_score ?? 3 }])
  );

  const upsertedRows: SearchPerformanceOpportunityRow[] = [];
  for (const candidate of candidates) {
    const relevance = candidate.keywordId ? relevanceByKeywordId.get(candidate.keywordId) : undefined;
    const businessRelevance = relevance?.businessRelevance ?? 3;
    const commercialValue = relevance?.commercialValue ?? 3;
    const effort = getEffortForAction(candidate.recommendedAction);
    const opportunityScore = computeSearchPerformanceScore({
      businessRelevance,
      commercialValue,
      opportunityMagnitude: candidate.opportunityMagnitude,
      trafficSignal: candidate.trafficSignal,
      effort,
    });

    const row = await upsertSearchPerformanceOpportunity({
      organizationId: website.organization_id,
      websiteId: website.id,
      detectorType: candidate.detectorType,
      keywordId: candidate.keywordId,
      pageId: candidate.pageId,
      relatedPageId: candidate.relatedPageId,
      dedupeKey: buildDedupeKey({ detectorType: candidate.detectorType, keywordId: candidate.keywordId, pageId: candidate.pageId, relatedPageId: candidate.relatedPageId }),
      signals: { ...candidate.signals, businessRelevance, commercialValue, effort, comparisonWindowDays },
      opportunityScore,
      recommendedAction: candidate.recommendedAction,
      reasoning: candidate.reasoning,
    });
    upsertedRows.push(row);
  }

  // --- Optional, bounded AI interpretation pass (additive only — never blocks promotion) ---
  const rationaleOverrideById = new Map<string, string>();
  let aiInterpreted = 0;
  const toInterpret = await listUnanalysedSearchPerformanceOpportunities(website.id, MAX_AI_INTERPRETATIONS_PER_RUN);
  if (toInterpret.length > 0) {
    const prompt = buildSearchPerformanceUserPrompt({
      websiteName: website.name,
      baseUrl: website.base_url,
      opportunities: toInterpret.map((o) => ({
        id: o.id,
        detectorType: o.detector_type,
        recommendedAction: o.recommended_action,
        reasoning: o.reasoning,
        signals: o.signals as Record<string, unknown>,
      })),
    });

    const aiJob = await createAiJob({
      organization_id: website.organization_id,
      job_id: job.id,
      provider: "anthropic",
      model: getAIProvider().defaultModel,
      prompt_version: SEARCH_PERFORMANCE_PROMPT_VERSION,
      purpose: "search_performance_interpretation",
      input_summary: { opportunity_count: toInterpret.length },
      status: "PROCESSING",
    });

    try {
      const aiResult = await getAIProvider().generateStructuredOutput({
        system: SEARCH_PERFORMANCE_SYSTEM_PROMPT,
        prompt,
        schema: searchPerformanceInterpretationSchema,
        jsonSchema: searchPerformanceInterpretationJsonSchema,
        schemaName: "search_performance_interpretation",
      });
      await completeAiJob(aiJob.id, {
        status: "COMPLETED",
        result: { interpretation_count: aiResult.data.interpretations.length },
        prompt_tokens: aiResult.usage.promptTokens,
        completion_tokens: aiResult.usage.completionTokens,
        total_tokens: aiResult.usage.totalTokens,
        latency_ms: aiResult.latencyMs,
      });

      const validIds = new Set(toInterpret.map((o) => o.id));
      for (const item of aiResult.data.interpretations) {
        if (!validIds.has(item.opportunity_id)) continue; // ignore any id the model didn't actually receive
        const combinedRisk = item.cannibalisation_risk ? [item.risk_notes, "Possible keyword/page cannibalisation."].filter(Boolean).join(" ") : item.risk_notes;
        await recordAiInterpretation(item.opportunity_id, item.rationale, combinedRisk);
        rationaleOverrideById.set(item.opportunity_id, item.rationale);
        aiInterpreted++;
      }
    } catch (error) {
      // Soft failure by design: interpretation is additive, never blocks detection/promotion.
      await completeAiJob(aiJob.id, { status: "FAILED", error: error instanceof Error ? error.message : String(error) });
      console.warn(`[jobs] search-performance AI interpretation failed for website ${website.id}, continuing without it:`, error);
    }
  }

  // --- Promotion into the existing seo_opportunities/seo_tasks system ---
  // Promotes straight from what this run just upserted (already has the
  // fresh score/seo_opportunity_id state) — no need to re-query. Bounded to
  // MAX_PROMOTIONS_PER_RUN, highest-scored first, so a cheap/easy detector
  // (e.g. internal linking, effort=1) clearing the threshold on many rows at
  // once can't flood the task list in a single run — rows that don't fit are
  // still stored/scored and get picked up on a later run.
  let opportunitiesPromoted = 0;
  const promotionCandidates = [...upsertedRows].sort((a, b) => b.opportunity_score - a.opportunity_score);
  for (const row of promotionCandidates) {
    if (opportunitiesPromoted >= MAX_PROMOTIONS_PER_RUN) break;
    if (!shouldPromoteSearchPerformanceOpportunity({ recommendedAction: row.recommended_action, opportunityScore: row.opportunity_score, seoOpportunityId: row.seo_opportunity_id })) {
      continue;
    }

    const subject = (row.keyword_id && keywordTextById.get(row.keyword_id)) || (row.page_id && pageUrlById.get(row.page_id)) || "opportunity";
    const title = `${row.detector_type.replace(/_/g, " ")}: ${subject}`;
    const rationale = rationaleOverrideById.get(row.id) ?? row.reasoning;
    const effort = getEffortForAction(row.recommended_action);

    const seoOpportunity = await insertOpportunity({
      organization_id: website.organization_id,
      website_id: website.id,
      type: row.recommended_action,
      title,
      description: row.reasoning,
      rationale,
      target_page_id: row.page_id,
      priority_score: row.opportunity_score,
      priority_components: { detector_type: row.detector_type, signals: row.signals as Record<string, unknown> },
      effort_estimate: effortLevel(effort),
    });
    await insertTask({
      organization_id: website.organization_id,
      website_id: website.id,
      opportunity_id: seoOpportunity.id,
      title: seoOpportunity.title,
      description: seoOpportunity.description,
      type: row.recommended_action,
      priority: Math.round(row.opportunity_score),
    });
    await markSearchPerformancePromoted(row.id, seoOpportunity.id);
    opportunitiesPromoted++;
  }

  const result: AnalyseSearchPerformanceResult = { candidatesDetected: candidates.length, aiInterpreted, opportunitiesPromoted, comparisonWindowDays };
  return { ...result };
};
