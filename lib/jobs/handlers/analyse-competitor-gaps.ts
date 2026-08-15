import { getWebsite } from "@/lib/db/websites";
import { listPagesForWebsite } from "@/lib/db/pages";
import { listKeywordsForWebsite, listKeywordOpportunitiesForWebsite } from "@/lib/db/keywords";
import { listSearchConsoleMetricsForWebsiteInRange } from "@/lib/db/search-console";
import { listLatestCompletedSerpRunsForWebsite, listSerpResultsForRuns } from "@/lib/db/serp";
import { listCompetitorDomainsForWebsite } from "@/lib/db/competitors";
import { upsertSearchPerformanceCandidates, runAiInterpretationPass, promoteSearchPerformanceOpportunities } from "@/lib/jobs/handlers/search-performance-shared";
import { normalizeKeyword } from "@/lib/keywords/normalize";
import { aggregateByQuery } from "@/lib/search-performance/comparison";
import { getSerpPriorityTier } from "@/lib/serp/priority-tier";
import { detectCompetitorContentGaps } from "@/lib/search-performance/detectors/competitor-content-gap";
import { detectCompetitorRankingGaps } from "@/lib/search-performance/detectors/competitor-ranking-gap";
import { detectSerpFeatureOpportunities } from "@/lib/search-performance/detectors/serp-feature-opportunity";
import type { KeywordCompetitiveSignal, CompetitorRankingEntry } from "@/lib/search-performance/detectors/competitor-shared";
import type { PageForMatching, SearchPerformanceCandidate } from "@/lib/search-performance/types";
import type { SerpFeatures } from "@/lib/serp/provider";
import type { JobHandler } from "@/lib/jobs/types";
import type { Database } from "@/lib/supabase/types";

type SerpResultRow = Database["public"]["Tables"]["serp_results"]["Row"];

export interface AnalyseCompetitorGapsResult {
  candidatesDetected: number;
  aiInterpreted: number;
  opportunitiesPromoted: number;
}

/**
 * ANALYSE_COMPETITOR_GAPS: the deterministic gap-detection layer over
 * everything FETCH_SERP_RESULTS/ANALYSE_COMPETITORS collected — builds one
 * competitive signal per keyword (client position, every classified
 * competitor's position, SERP features) from the latest completed serp_run
 * per keyword, runs the 3 competitor detectors, and pushes the results
 * through the *same* upsert/AI-interpret/promote pipeline
 * analyse-search-performance.ts uses (lib/jobs/handlers/search-performance-shared.ts)
 * — one opportunity system, not a parallel one.
 */
export const handleAnalyseCompetitorGaps: JobHandler = async ({ job }) => {
  if (!job.website_id) throw new Error("ANALYSE_COMPETITOR_GAPS job is missing website_id");
  const website = await getWebsite(job.website_id);
  if (!website) throw new Error(`Website ${job.website_id} not found`);

  const [pages, keywords, keywordOpportunities, competitorDomains, latestRuns] = await Promise.all([
    listPagesForWebsite(website.id),
    listKeywordsForWebsite(website.id),
    listKeywordOpportunitiesForWebsite(website.id),
    listCompetitorDomainsForWebsite(website.id),
    listLatestCompletedSerpRunsForWebsite(website.id),
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
  const classificationByDomain = new Map(competitorDomains.map((c) => [c.domain, c.classification]));
  const scoreByKeywordId = new Map(keywordOpportunities.map((ko) => [ko.keyword_id, ko.opportunity_score]));

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const recentMetrics = await listSearchConsoleMetricsForWebsiteInRange(website.id, since.toISOString().slice(0, 10), new Date().toISOString().slice(0, 10));
  const impressionsByNormalizedQuery = new Map(Array.from(aggregateByQuery(recentMetrics).values()).map((a) => [a.normalizedQuery, a.impressions]));

  const runsWithKeyword = latestRuns.filter((r) => r.keyword_id !== null);
  const resultsByRun = new Map<string, SerpResultRow[]>();
  const allResults = await listSerpResultsForRuns(runsWithKeyword.map((r) => r.id));
  for (const result of allResults) {
    const list = resultsByRun.get(result.serp_run_id) ?? [];
    list.push(result);
    resultsByRun.set(result.serp_run_id, list);
  }

  const rankingSignals: KeywordCompetitiveSignal[] = [];
  const featureSignals: { keyword: string; keywordId: string | null; features: SerpFeatures; clientHoldsFeaturedSnippet: boolean; clientHoldsLocalPack: boolean; isHighPriority: boolean; impressions?: number }[] = [];

  for (const run of runsWithKeyword) {
    const results = resultsByRun.get(run.id) ?? [];
    const clientResult = results.find((r) => r.is_client_domain);
    const competitors: CompetitorRankingEntry[] = results
      .filter((r) => !r.is_client_domain)
      .map((r) => ({
        domain: r.domain,
        classification: classificationByDomain.get(r.domain) ?? "UNKNOWN",
        position: r.position,
        url: r.url,
        pageTitle: r.title,
      }));
    const impressions = impressionsByNormalizedQuery.get(normalizeKeyword(run.keyword)) ?? 0;

    rankingSignals.push({
      keyword: run.keyword,
      keywordId: run.keyword_id,
      clientPosition: clientResult?.position ?? null,
      clientImpressions: impressions,
      competitors,
    });

    const features = (run.features as unknown as SerpFeatures) ?? { localPack: false, featuredSnippet: false, reviews: false, faq: false, video: false, sitelinks: false, shopping: false, other: [] };
    const isHighPriority = getSerpPriorityTier({ keywordOpportunityScore: run.keyword_id ? (scoreByKeywordId.get(run.keyword_id) ?? null) : null, hasPageTwoOpportunity: false, recentImpressions: impressions }) === "HIGH";
    featureSignals.push({
      keyword: run.keyword,
      keywordId: run.keyword_id,
      features,
      clientHoldsFeaturedSnippet: clientResult?.result_type === "featured_snippet",
      clientHoldsLocalPack: clientResult?.result_type === "local_pack",
      isHighPriority,
      impressions,
    });
  }

  const candidates: SearchPerformanceCandidate[] = [
    ...detectCompetitorContentGaps(rankingSignals, pagesForMatching),
    ...detectCompetitorRankingGaps(rankingSignals, pagesForMatching, pageIdByUrl),
    ...detectSerpFeatureOpportunities(featureSignals),
  ];

  const upsertedRows = await upsertSearchPerformanceCandidates(website, candidates, keywordOpportunities);
  const { aiInterpreted, rationaleOverrideById } = await runAiInterpretationPass(website, job.id);
  const keywordTextById = new Map(keywords.map((k) => [k.id, k.keyword]));
  const pageUrlById = new Map(pages.map((p) => [p.id, p.url]));
  const opportunitiesPromoted = await promoteSearchPerformanceOpportunities(website, upsertedRows, { keywordTextById, pageUrlById }, rationaleOverrideById);

  const result: AnalyseCompetitorGapsResult = { candidatesDetected: candidates.length, aiInterpreted, opportunitiesPromoted };
  return { ...result };
};
