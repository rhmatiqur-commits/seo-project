import { getWebsite } from "@/lib/db/websites";
import { listKeywordsForWebsite } from "@/lib/db/keywords";
import { listCompetitorResultsForWebsite, upsertCompetitorDomain, upsertCompetitorPage } from "@/lib/db/competitors";
import { aggregateCompetitorDomains, type CompetitorResultRow } from "@/lib/serp/aggregate-competitors";
import { fetchAndAnalyzeCompetitorPage } from "@/lib/serp/fetch-competitor-page";
import { MAX_COMPETITOR_RESULTS_CONSIDERED_PER_KEYWORD, MAX_COMPETITOR_PAGES_PER_RUN } from "@/lib/serp/limits";
import type { JobHandler } from "@/lib/jobs/types";

export interface AnalyseCompetitorsResult {
  competitorDomainsUpserted: number;
  competitorPagesAnalyzed: number;
  competitorPagesFailed: number;
}

/**
 * ANALYSE_COMPETITORS: aggregates every stored (non-client) serp_results row
 * into classified, scored competitor_domains rows (lib/serp/aggregate-
 * competitors.ts's pure math — deterministic, no AI), then fetches+analyzes
 * a bounded number of the most relevant DIRECT_COMPETITOR pages
 * (lib/serp/fetch-competitor-page.ts, reusing the crawler's own fetch/parse/
 * robots logic) — structured metadata only, never body text.
 */
export const handleAnalyseCompetitors: JobHandler = async ({ job }) => {
  if (!job.website_id) throw new Error("ANALYSE_COMPETITORS job is missing website_id");
  const website = await getWebsite(job.website_id);
  if (!website) throw new Error(`Website ${job.website_id} not found`);

  const [keywords, rawResults] = await Promise.all([listKeywordsForWebsite(website.id), listCompetitorResultsForWebsite(website.id)]);

  const commercialKeywordIds = new Set(keywords.filter((k) => k.search_intent === "COMMERCIAL" || k.search_intent === "TRANSACTIONAL").map((k) => k.id));
  const clientTargetKeywordIds = new Set(keywords.map((k) => k.id));

  // Only the top few positions per keyword are a meaningful competitive
  // signal — position 47 isn't evidence of a real competitor.
  const byKeyword = new Map<string, typeof rawResults>();
  for (const row of rawResults) {
    const key = row.keyword_id ?? "__no_keyword__";
    const list = byKeyword.get(key) ?? [];
    list.push(row);
    byKeyword.set(key, list);
  }
  const boundedRows = Array.from(byKeyword.values()).flatMap((rows) =>
    [...rows].sort((a, b) => a.position - b.position).slice(0, MAX_COMPETITOR_RESULTS_CONSIDERED_PER_KEYWORD)
  );

  const aggregationInput: CompetitorResultRow[] = boundedRows.map((r) => ({
    domain: r.domain,
    keywordId: r.keyword_id,
    position: r.position,
    isCommercialKeyword: r.keyword_id !== null && commercialKeywordIds.has(r.keyword_id),
  }));

  const aggregated = aggregateCompetitorDomains(aggregationInput, clientTargetKeywordIds);

  const domainRows: { id: string; domain: string; classification: string; bestUrl: string | null; bestPosition: number }[] = [];
  for (const agg of aggregated) {
    const row = await upsertCompetitorDomain({
      organizationId: website.organization_id,
      websiteId: website.id,
      domain: agg.domain,
      classification: agg.classification,
      appearances: agg.appearances,
      averagePosition: agg.averagePosition,
      relevantKeywordCount: agg.relevantKeywordCount,
      relevanceScore: agg.relevanceScore,
    });
    const best = boundedRows.filter((r) => r.domain === agg.domain).sort((a, b) => a.position - b.position)[0];
    domainRows.push({ id: row.id, domain: agg.domain, classification: agg.classification, bestUrl: best?.url ?? null, bestPosition: best?.position ?? Infinity });
  }

  // Prioritise fetching pages for the most relevant DIRECT_COMPETITOR
  // domains — "do not crawl every competitor URL automatically."
  const candidatePages = domainRows
    .filter((d) => d.classification === "DIRECT_COMPETITOR" && d.bestUrl)
    .slice(0, MAX_COMPETITOR_PAGES_PER_RUN);

  let competitorPagesAnalyzed = 0;
  let competitorPagesFailed = 0;
  for (const candidate of candidatePages) {
    try {
      const analysis = await fetchAndAnalyzeCompetitorPage(candidate.bestUrl!);
      if (!analysis) {
        competitorPagesFailed++;
        continue;
      }
      await upsertCompetitorPage({
        competitorDomainId: candidate.id,
        url: candidate.bestUrl!,
        title: analysis.title,
        metaDescription: analysis.metaDescription,
        h1: analysis.h1,
        headings: analysis.headings,
        wordCount: analysis.wordCount,
        hasStructuredData: analysis.hasStructuredData,
        structuredDataTypes: analysis.structuredDataTypes,
        majorTopics: analysis.majorTopics,
        crawlStatus: analysis.httpStatus && analysis.httpStatus < 400 ? "COMPLETED" : "FAILED",
      });
      competitorPagesAnalyzed++;
    } catch (error) {
      console.warn(`[jobs] competitor page fetch failed for ${candidate.bestUrl}, continuing:`, error);
      competitorPagesFailed++;
    }
  }

  const result: AnalyseCompetitorsResult = { competitorDomainsUpserted: domainRows.length, competitorPagesAnalyzed, competitorPagesFailed };
  return { ...result };
};
