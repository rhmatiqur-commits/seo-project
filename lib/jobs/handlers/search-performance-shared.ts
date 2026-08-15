import { upsertSearchPerformanceOpportunity, listUnanalysedSearchPerformanceOpportunities, recordAiInterpretation, markSearchPerformancePromoted } from "@/lib/db/search-performance";
import { insertOpportunity } from "@/lib/db/opportunities";
import { insertTask } from "@/lib/db/tasks";
import { createAiJob, completeAiJob } from "@/lib/db/ai-jobs";
import { getAIProvider } from "@/lib/ai/get-provider";
import { searchPerformanceInterpretationSchema, searchPerformanceInterpretationJsonSchema } from "@/lib/ai/schemas";
import { SEARCH_PERFORMANCE_PROMPT_VERSION, SEARCH_PERFORMANCE_SYSTEM_PROMPT, buildSearchPerformanceUserPrompt } from "@/lib/ai/prompts/search-performance";
import { computeSearchPerformanceScore, getEffortForAction, shouldPromoteSearchPerformanceOpportunity } from "@/lib/search-performance/scoring";
import { buildDedupeKey } from "@/lib/search-performance/dedupe-key";
import { MAX_AI_INTERPRETATIONS_PER_RUN, MAX_PROMOTIONS_PER_RUN } from "@/lib/search-performance/limits";
import type { SearchPerformanceCandidate } from "@/lib/search-performance/types";
import type { Database, OpportunityEffort } from "@/lib/supabase/types";

/**
 * The upsert/AI-interpretation/promotion steps of the SEO Decision Engine
 * pipeline, extracted out of lib/jobs/handlers/analyse-search-performance.ts
 * so lib/jobs/handlers/analyse-competitor-gaps.ts (Phase 3) uses the exact
 * same code path instead of a copy — "do NOT create a parallel opportunity
 * system," per the Phase 3 spec. Every detector, regardless of which job
 * produced it, scores/AI-interprets/promotes through this one pipeline.
 */

export type SearchPerformanceOpportunityRow = Database["public"]["Tables"]["search_performance_opportunities"]["Row"];

export interface RelevanceInput {
  keyword_id: string;
  business_relevance_score: number | null;
  commercial_value_score: number | null;
}

function effortLevel(effort: number): OpportunityEffort {
  if (effort <= 2) return "low";
  if (effort >= 4) return "high";
  return "medium";
}

/**
 * Scores and upserts a batch of detector candidates. businessRelevance/
 * commercialValue come from a matched keyword_opportunities row (Phase 2B's
 * AI judgement, reused) when one exists, default 3 (neutral) otherwise —
 * never a fresh AI call just to score.
 */
export async function upsertSearchPerformanceCandidates(
  website: { organization_id: string; id: string },
  candidates: SearchPerformanceCandidate[],
  keywordOpportunities: RelevanceInput[],
  extraSignals: Record<string, unknown> = {}
): Promise<SearchPerformanceOpportunityRow[]> {
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
      signals: { ...candidate.signals, ...extraSignals, businessRelevance, commercialValue, effort },
      opportunityScore,
      recommendedAction: candidate.recommendedAction,
      reasoning: candidate.reasoning,
    });
    upsertedRows.push(row);
  }
  return upsertedRows;
}

export interface AiInterpretationResult {
  aiInterpreted: number;
  rationaleOverrideById: Map<string, string>;
}

/** Bounded, additive-only AI interpretation pass over not-yet-interpreted
 * opportunities for this website (regardless of which detector/job produced
 * them). A failed/skipped AI call never blocks detection or promotion. */
export async function runAiInterpretationPass(website: { organization_id: string; id: string; name: string; base_url: string }, jobId: string): Promise<AiInterpretationResult> {
  const rationaleOverrideById = new Map<string, string>();
  let aiInterpreted = 0;

  const toInterpret = await listUnanalysedSearchPerformanceOpportunities(website.id, MAX_AI_INTERPRETATIONS_PER_RUN);
  if (toInterpret.length === 0) return { aiInterpreted, rationaleOverrideById };

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
    job_id: jobId,
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

  return { aiInterpreted, rationaleOverrideById };
}

export interface PromotionSubjectLookup {
  keywordTextById: Map<string, string>;
  pageUrlById: Map<string, string>;
}

/** Promotes qualifying rows (from this run's own upsert batch) into
 * seo_opportunities/seo_tasks — bounded to MAX_PROMOTIONS_PER_RUN,
 * highest-scored first, so a cheap/easy detector clearing the threshold on
 * many rows at once can't flood the task list in a single run. */
export async function promoteSearchPerformanceOpportunities(
  website: { organization_id: string; id: string },
  rows: SearchPerformanceOpportunityRow[],
  lookup: PromotionSubjectLookup,
  rationaleOverrideById: Map<string, string> = new Map()
): Promise<number> {
  let opportunitiesPromoted = 0;
  const promotionCandidates = [...rows].sort((a, b) => b.opportunity_score - a.opportunity_score);

  for (const row of promotionCandidates) {
    if (opportunitiesPromoted >= MAX_PROMOTIONS_PER_RUN) break;
    if (!shouldPromoteSearchPerformanceOpportunity({ recommendedAction: row.recommended_action, opportunityScore: row.opportunity_score, seoOpportunityId: row.seo_opportunity_id })) {
      continue;
    }

    const subject = (row.keyword_id && lookup.keywordTextById.get(row.keyword_id)) || (row.page_id && lookup.pageUrlById.get(row.page_id)) || "opportunity";
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

  return opportunitiesPromoted;
}
