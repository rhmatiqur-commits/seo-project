import { getWebsite } from "@/lib/db/websites";
import { listPagesForWebsite, listLinksForWebsite } from "@/lib/db/pages";
import { listKeywordsForWebsite, listKeywordOpportunitiesForWebsite, listLatestKeywordSearchVolumes } from "@/lib/db/keywords";
import { listSearchConsoleMetricsForWebsiteInRange, getSearchConsoleStatsForWebsite } from "@/lib/db/search-console";
import { upsertSearchPerformanceCandidates, runAiInterpretationPass, promoteSearchPerformanceOpportunities } from "@/lib/jobs/handlers/search-performance-shared";
import { normalizeKeyword } from "@/lib/keywords/normalize";
import { aggregateByQuery, comparePeriods } from "@/lib/search-performance/comparison";
import { DEFAULT_COMPARISON_WINDOW_DAYS, EXTENDED_COMPARISON_WINDOW_DAYS } from "@/lib/search-performance/limits";
import { detectPageTwoOpportunities } from "@/lib/search-performance/detectors/page-two";
import { detectHighImpressionsLowCtr } from "@/lib/search-performance/detectors/low-ctr";
import { detectMissingPages, type KeywordForMissingPage } from "@/lib/search-performance/detectors/missing-page";
import { detectDecliningKeywords } from "@/lib/search-performance/detectors/declining-keyword";
import { detectEmergingKeywords } from "@/lib/search-performance/detectors/emerging-keyword";
import { detectContentGaps, type KeywordOpportunityForContentGap } from "@/lib/search-performance/detectors/content-gap";
import { detectInternalLinkOpportunities, type KeywordForInternalLink } from "@/lib/search-performance/detectors/internal-link";
import type { PageForMatching, SearchPerformanceCandidate } from "@/lib/search-performance/types";
import type { JobHandler } from "@/lib/jobs/types";

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

  // --- Score + upsert, AI-interpret, promote — shared with analyse-competitor-gaps.ts ---
  const upsertedRows = await upsertSearchPerformanceCandidates(website, candidates, keywordOpportunities, { comparisonWindowDays });
  const { aiInterpreted, rationaleOverrideById } = await runAiInterpretationPass(website, job.id);
  const opportunitiesPromoted = await promoteSearchPerformanceOpportunities(website, upsertedRows, { keywordTextById, pageUrlById }, rationaleOverrideById);

  const result: AnalyseSearchPerformanceResult = { candidatesDetected: candidates.length, aiInterpreted, opportunitiesPromoted, comparisonWindowDays };
  return { ...result };
};
