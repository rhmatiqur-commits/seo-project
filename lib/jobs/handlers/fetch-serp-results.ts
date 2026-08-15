import { getWebsite, updateWebsite } from "@/lib/db/websites";
import { listKeywordsForWebsite, listKeywordOpportunitiesForWebsite } from "@/lib/db/keywords";
import { listSearchConsoleMetricsForWebsiteInRange } from "@/lib/db/search-console";
import { listSearchPerformanceOpportunitiesForWebsite } from "@/lib/db/search-performance";
import { createSerpRun, markSerpRunCompleted, markSerpRunFailed, insertSerpResults, listLatestCompletedSerpRunsForWebsite } from "@/lib/db/serp";
import { logProviderUsage } from "@/lib/db/provider-usage";
import { getSerpProvider } from "@/lib/serp/get-provider";
import { isClientDomain } from "@/lib/serp/client-domain";
import { normalizeKeyword } from "@/lib/keywords/normalize";
import { aggregateByQuery } from "@/lib/search-performance/comparison";
import { getSerpPriorityTier, isKeywordDueForSerpFetch } from "@/lib/serp/priority-tier";
import { MAX_KEYWORDS_PER_SERP_FETCH_RUN, DATAFORSEO_SERP_COST_ESTIMATE_USD } from "@/lib/serp/limits";
import type { JobHandler } from "@/lib/jobs/types";

export interface FetchSerpResultsResult {
  keywordsSelected: number;
  succeeded: number;
  failed: number;
}

/**
 * FETCH_SERP_RESULTS: selects the highest-priority *due* keywords (tiered
 * cadence — see lib/serp/priority-tier.ts), fetches real SERP data for each
 * via the configured SerpDataProvider, stores it, and marks the client's own
 * domain. Per-keyword failures are soft (logged to that keyword's serp_run,
 * the batch continues); the job only fails outright (flowing into the
 * existing retry policy) if every attempted keyword failed.
 */
export const handleFetchSerpResults: JobHandler = async ({ job }) => {
  if (!job.website_id) throw new Error("FETCH_SERP_RESULTS job is missing website_id");
  const website = await getWebsite(job.website_id);
  if (!website) throw new Error(`Website ${job.website_id} not found`);

  const [keywords, keywordOpportunities, pageTwoOpportunities, latestRuns] = await Promise.all([
    listKeywordsForWebsite(website.id),
    listKeywordOpportunitiesForWebsite(website.id),
    listSearchPerformanceOpportunitiesForWebsite(website.id, { detectorType: "PAGE_TWO_OPPORTUNITY" }),
    listLatestCompletedSerpRunsForWebsite(website.id),
  ]);

  // Recent GSC impressions per keyword — real measured data, used only as a priority signal.
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const recentMetrics = await listSearchConsoleMetricsForWebsiteInRange(website.id, since.toISOString().slice(0, 10), new Date().toISOString().slice(0, 10));
  const impressionsByNormalizedQuery = new Map(Array.from(aggregateByQuery(recentMetrics).values()).map((a) => [a.normalizedQuery, a.impressions]));

  const scoreByKeywordId = new Map(keywordOpportunities.map((ko) => [ko.keyword_id, ko.opportunity_score]));
  const pageTwoKeywordIds = new Set(pageTwoOpportunities.map((o) => o.keyword_id).filter((id): id is string => id !== null));
  const lastSearchedAtByKeywordId = new Map(latestRuns.filter((r) => r.keyword_id).map((r) => [r.keyword_id as string, r.searched_at]));

  const now = new Date();
  const dueKeywords = keywords
    .map((k) => {
      const tier = getSerpPriorityTier({
        keywordOpportunityScore: scoreByKeywordId.get(k.id) ?? null,
        hasPageTwoOpportunity: pageTwoKeywordIds.has(k.id),
        recentImpressions: impressionsByNormalizedQuery.get(normalizeKeyword(k.keyword)) ?? 0,
      });
      return { keyword: k, tier, lastSearchedAt: lastSearchedAtByKeywordId.get(k.id) ?? null };
    })
    .filter((entry) => isKeywordDueForSerpFetch(entry.tier, entry.lastSearchedAt, now))
    // HIGH first, then by whether it's ever been fetched (never-fetched first), stable otherwise.
    .sort((a, b) => {
      const tierRank = { HIGH: 0, MEDIUM: 1, LOW: 2 };
      if (tierRank[a.tier] !== tierRank[b.tier]) return tierRank[a.tier] - tierRank[b.tier];
      if (!a.lastSearchedAt && b.lastSearchedAt) return -1;
      if (a.lastSearchedAt && !b.lastSearchedAt) return 1;
      return 0;
    })
    .slice(0, MAX_KEYWORDS_PER_SERP_FETCH_RUN);

  const provider = getSerpProvider();
  const websiteHostname = new URL(website.base_url).hostname;

  let succeeded = 0;
  let failed = 0;
  const failureMessages: string[] = [];

  for (const { keyword } of dueKeywords) {
    const run = await createSerpRun({
      organizationId: website.organization_id,
      websiteId: website.id,
      keywordId: keyword.id,
      keyword: keyword.keyword,
      location: website.default_serp_location,
      country: keyword.country,
      language: keyword.language,
    });

    try {
      const result = await provider.getSerpResults(keyword.keyword, { country: keyword.country, language: keyword.language, location: website.default_serp_location });
      await insertSerpResults(
        result.results.map((r) => ({
          serp_run_id: run.id,
          position: r.position,
          domain: r.domain,
          url: r.url,
          title: r.title,
          description: r.description,
          result_type: r.resultType,
          is_client_domain: isClientDomain(r.domain, websiteHostname),
        }))
      );
      await markSerpRunCompleted(run.id, { features: result.features as unknown as Record<string, unknown>, rawResponse: result.raw ?? null });
      if (provider.name !== "none") {
        await logProviderUsage({ organizationId: website.organization_id, websiteId: website.id, provider: provider.name, operation: "serp_search", units: 1, estimatedCostUsd: DATAFORSEO_SERP_COST_ESTIMATE_USD });
      }
      succeeded++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await markSerpRunFailed(run.id, message);
      failureMessages.push(`${keyword.keyword}: ${message}`);
      failed++;
    }
  }

  // Own independent schedule, same shape as crawl/keyword-discovery/search-console-sync.
  const nextRunAt = new Date(Date.now() + website.serp_fetch_frequency_days * 24 * 60 * 60 * 1000);
  await updateWebsite(website.id, { next_serp_fetch_at: nextRunAt.toISOString() });

  if (dueKeywords.length > 0 && succeeded === 0) {
    throw new Error(`FETCH_SERP_RESULTS: all ${failed} attempted keyword(s) failed. First error: ${failureMessages[0]}`);
  }

  const result: FetchSerpResultsResult = { keywordsSelected: dueKeywords.length, succeeded, failed };
  return { ...result };
};
