import { getAIProvider } from "@/lib/ai/get-provider";
import { keywordDiscoveryAnalysisSchema, keywordDiscoveryAnalysisJsonSchema } from "@/lib/ai/schemas";
import { KEYWORD_DISCOVERY_PROMPT_VERSION, KEYWORD_DISCOVERY_SYSTEM_PROMPT, buildKeywordDiscoveryUserPrompt } from "@/lib/ai/prompts/keyword-discovery";
import { getWebsite, updateWebsite } from "@/lib/db/websites";
import { listPagesForWebsite } from "@/lib/db/pages";
import { createAiJob, completeAiJob } from "@/lib/db/ai-jobs";
import {
  upsertKeyword,
  listKeywordsForWebsite,
  insertKeywordMetrics,
  upsertKeywordPageMatch,
  upsertKeywordOpportunity,
  markKeywordOpportunityPromoted,
  linkOpportunityKeyword,
} from "@/lib/db/keywords";
import { insertOpportunity } from "@/lib/db/opportunities";
import { insertTask } from "@/lib/db/tasks";
import { getKeywordProvider } from "@/lib/keywords/get-provider";
import { mergeKeywordCandidates, type KeywordCandidate } from "@/lib/keywords/merge";
import { dedupeKeywords, normalizeKeyword } from "@/lib/keywords/normalize";
import { findBestPageMatch, type MatchablePage } from "@/lib/keywords/matching";
import { computeKeywordOpportunityScore } from "@/lib/keywords/scoring";
import { MAX_KEYWORDS_PER_DISCOVERY_RUN, MIN_PAGE_MATCH_RELEVANCE, PROMOTION_THRESHOLD } from "@/lib/keywords/limits";
import type { JobHandler } from "@/lib/jobs/types";
import type { OpportunityType } from "@/lib/supabase/types";

export interface KeywordDiscoveryResult {
  aiJobId: string;
  keywordsDiscovered: number;
  keywordsWithPageMatch: number;
  keywordGaps: number;
  opportunitiesPromoted: number;
}

/** Maps the AI's page-match confidence (which page, if any) plus the lexical
 * matcher's own best guess into a single opportunity_type — existing page
 * well-covered -> optimise it; no relevant page at all -> create one; a weak
 * or ambiguous signal -> flag for research rather than guessing. */
function decideOpportunityType(bestMatchScore: number, aiHasPageMatch: boolean): OpportunityType {
  if (bestMatchScore >= MIN_PAGE_MATCH_RELEVANCE || aiHasPageMatch) return "OPTIMISE_EXISTING_PAGE";
  return "CREATE_NEW_PAGE";
}

export const handleKeywordDiscovery: JobHandler = async ({ job }) => {
  if (!job.website_id) throw new Error("KEYWORD_DISCOVERY job is missing website_id");
  const website = await getWebsite(job.website_id);
  if (!website) throw new Error(`Website ${job.website_id} not found`);

  const [pages, existingKeywords] = await Promise.all([listPagesForWebsite(website.id), listKeywordsForWebsite(website.id)]);

  const matchablePages: MatchablePage[] = pages.map((p) => ({
    url: p.url,
    title: p.title,
    h1: p.h1,
    headings: p.headings.map((h) => h.text),
    metaDescription: p.meta_description,
  }));
  const knownUrls = new Set(pages.map((p) => p.url));
  const pageIdByUrl = new Map(pages.map((p) => [p.url, p.id]));

  // --- AI candidate generation (hard failure: logged to ai_jobs, rethrown so
  // the job itself fails and flows into the existing Phase 2A retry policy) ---
  const prompt = buildKeywordDiscoveryUserPrompt({
    websiteName: website.name,
    baseUrl: website.base_url,
    pages: pages.map((p) => ({ url: p.url, title: p.title, h1: p.h1, metaDescription: p.meta_description, wordCount: p.word_count })),
    existingKeywords: existingKeywords.map((k) => k.keyword),
  });

  const aiJob = await createAiJob({
    organization_id: website.organization_id,
    job_id: job.id,
    provider: "anthropic",
    model: getAIProvider().defaultModel,
    prompt_version: KEYWORD_DISCOVERY_PROMPT_VERSION,
    purpose: "keyword_discovery",
    input_summary: { page_count: pages.length, existing_keyword_count: existingKeywords.length },
    status: "PROCESSING",
  });

  let aiResult;
  try {
    aiResult = await getAIProvider().generateStructuredOutput({
      system: KEYWORD_DISCOVERY_SYSTEM_PROMPT,
      prompt,
      schema: keywordDiscoveryAnalysisSchema,
      jsonSchema: keywordDiscoveryAnalysisJsonSchema,
      schemaName: "keyword_discovery",
    });
    await completeAiJob(aiJob.id, {
      status: "COMPLETED",
      result: { site_summary: aiResult.data.site_summary, suggestion_count: aiResult.data.keyword_suggestions.length },
      prompt_tokens: aiResult.usage.promptTokens,
      completion_tokens: aiResult.usage.completionTokens,
      total_tokens: aiResult.usage.totalTokens,
      latency_ms: aiResult.latencyMs,
    });
  } catch (error) {
    await completeAiJob(aiJob.id, { status: "FAILED", error: error instanceof Error ? error.message : String(error) });
    throw error;
  }

  // --- Real keyword-data provider (soft failure: log + continue AI-only) ---
  let providerCandidates: KeywordCandidate[] = [];
  try {
    const suggestions = await getKeywordProvider().getKeywordSuggestions(
      { url: website.base_url },
      { country: "GB", language: "en", limit: MAX_KEYWORDS_PER_DISCOVERY_RUN }
    );
    providerCandidates = suggestions.map((s) => ({ keyword: s.keyword, source: "provider" as const }));
  } catch (error) {
    console.warn(`[jobs] keyword provider call failed for website ${website.id}, continuing AI-only:`, error);
  }

  const aiCandidates: KeywordCandidate[] = aiResult.data.keyword_suggestions.map((s) => ({ keyword: s.keyword, source: "ai_suggested" as const }));
  const merged = mergeKeywordCandidates(providerCandidates, aiCandidates);
  const deduped = dedupeKeywords(merged.map((c) => c.keyword)).slice(0, MAX_KEYWORDS_PER_DISCOVERY_RUN);

  const aiByKeyword = new Map(aiResult.data.keyword_suggestions.map((s) => [normalizeKeyword(s.keyword), s]));

  let keywordsDiscovered = 0;
  let keywordsWithPageMatch = 0;
  let keywordGaps = 0;
  let opportunitiesPromoted = 0;

  for (const rawKeyword of deduped) {
    const ai = aiByKeyword.get(normalizeKeyword(rawKeyword));

    const keywordRow = await upsertKeyword({
      organizationId: website.organization_id,
      websiteId: website.id,
      keyword: rawKeyword,
      source: ai ? "ai_suggested" : "provider",
      searchIntent: ai?.search_intent ?? "UNKNOWN",
    });
    keywordsDiscovered++;

    // Provider metrics — only ever real numbers; nothing invented here.
    const providerMetrics = await getKeywordProvider()
      .getKeywordMetrics([rawKeyword], { country: "GB", language: "en" })
      .catch(() => []);
    for (const m of providerMetrics) {
      await insertKeywordMetrics({
        keywordId: keywordRow.id,
        searchVolume: m.searchVolume,
        competition: m.competition,
        cpc: m.cpc,
        metricSource: getKeywordProvider().name,
      });
    }

    // Lexical page matching, optionally overridden by the AI's own holistic
    // judgement when it names a page our lexical matcher didn't surface.
    const lexicalBest = findBestPageMatch(rawKeyword, matchablePages);
    const aiMatchUrl = ai?.most_relevant_existing_url && knownUrls.has(ai.most_relevant_existing_url) ? ai.most_relevant_existing_url : null;

    let currentPageId: string | null = null;
    let bestMatchScore = 0;
    if (lexicalBest) {
      currentPageId = pageIdByUrl.get(lexicalBest.page.url) ?? null;
      bestMatchScore = lexicalBest.relevanceScore;
      await upsertKeywordPageMatch({
        keywordId: keywordRow.id,
        pageId: currentPageId!,
        matchType: lexicalBest.matchType,
        relevanceScore: lexicalBest.relevanceScore,
      });
    } else if (aiMatchUrl) {
      currentPageId = pageIdByUrl.get(aiMatchUrl) ?? null;
      bestMatchScore = 50; // AI-only signal, no lexical corroboration — moderate confidence
      await upsertKeywordPageMatch({ keywordId: keywordRow.id, pageId: currentPageId!, matchType: "ai_semantic", relevanceScore: bestMatchScore });
    }

    if (currentPageId) keywordsWithPageMatch++;
    else keywordGaps++;

    const businessRelevance = ai?.business_relevance ?? 3;
    const commercialValue = ai?.commercial_value ?? 3;
    const difficulty = ai?.difficulty ?? 3;
    const opportunityScore = computeKeywordOpportunityScore({
      businessRelevance,
      commercialValue,
      difficulty,
      existingPageRelevance: bestMatchScore,
    });
    const opportunityType = decideOpportunityType(bestMatchScore, Boolean(aiMatchUrl));
    const recommendedAction =
      opportunityType === "OPTIMISE_EXISTING_PAGE" ? `Optimise the existing page for "${rawKeyword}".` : `Create a new page targeting "${rawKeyword}".`;

    const keywordOpportunity = await upsertKeywordOpportunity({
      organizationId: website.organization_id,
      websiteId: website.id,
      keywordId: keywordRow.id,
      currentPageId,
      opportunityType,
      businessRelevanceScore: businessRelevance,
      commercialValueScore: commercialValue,
      difficultyScore: difficulty,
      opportunityScore,
      recommendedAction,
      reasoning: ai?.reasoning ?? "No AI classification available for this keyword; scored with default mid-range assumptions.",
    });

    // Promote only high-value, not-yet-promoted opportunities into the
    // existing seo_opportunities/seo_tasks system — this is what keeps
    // re-running discovery idempotent (never a second task for the same keyword).
    if (opportunityScore >= PROMOTION_THRESHOLD && !keywordOpportunity.seo_opportunity_id) {
      const seoOpportunity = await insertOpportunity({
        organization_id: website.organization_id,
        website_id: website.id,
        type: opportunityType,
        title: `Target keyword: "${rawKeyword}"`,
        description: recommendedAction,
        rationale: keywordOpportunity.reasoning,
        target_page_id: currentPageId,
        priority_score: opportunityScore,
        priority_components: { business_relevance: businessRelevance, commercial_value: commercialValue, difficulty, existing_page_relevance: bestMatchScore },
        effort_estimate: difficulty >= 4 ? "high" : difficulty <= 2 ? "low" : "medium",
        ai_job_id: aiJob.id,
      });
      await linkOpportunityKeyword(seoOpportunity.id, keywordRow.id);
      await insertTask({
        organization_id: website.organization_id,
        website_id: website.id,
        opportunity_id: seoOpportunity.id,
        title: seoOpportunity.title,
        description: seoOpportunity.description,
        type: opportunityType,
        priority: Math.round(opportunityScore),
      });
      await markKeywordOpportunityPromoted(keywordOpportunity.id, seoOpportunity.id);
      opportunitiesPromoted++;
    }
  }

  // Schedule the next recurring discovery run (mirrors handleCrawlWebsite's
  // next_crawl_at pattern from Phase 2A).
  const nextRunAt = new Date(Date.now() + website.keyword_discovery_frequency_days * 24 * 60 * 60 * 1000);
  await updateWebsite(website.id, { next_keyword_discovery_at: nextRunAt.toISOString() });

  const result: KeywordDiscoveryResult = { aiJobId: aiJob.id, keywordsDiscovered, keywordsWithPageMatch, keywordGaps, opportunitiesPromoted };
  return { ...result };
};
