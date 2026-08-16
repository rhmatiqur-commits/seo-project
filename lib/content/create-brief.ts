import { getOpportunity } from "@/lib/db/opportunities";
import { getWebsite } from "@/lib/db/websites";
import { getOrganization } from "@/lib/db/organizations";
import { getSearchPerformanceOpportunityBySeoOpportunityId } from "@/lib/db/search-performance";
import { getKeyword, listKeywordIdsForOpportunity, getLatestKeywordMetrics } from "@/lib/db/keywords";
import { getTaskForOpportunity } from "@/lib/db/tasks";
import { listPagesForWebsite, getPageById } from "@/lib/db/pages";
import { listSearchConsoleMetricsForKeywordOrPage } from "@/lib/db/search-console";
import { listCompetitorPagesWithDomainForWebsite } from "@/lib/db/competitors";
import { insertContentBrief } from "@/lib/db/content";
import { isContentEligibleOpportunityType } from "@/lib/content/eligibility";
import { buildContentBrief, type BuildContentBriefInput } from "@/lib/content/build-brief";
import { MAX_COMPETITOR_PAGES_IN_BRIEF, MAX_SECONDARY_KEYWORDS_IN_BRIEF } from "@/lib/content/limits";
import type { ContentBrief } from "@/lib/content/brief-types";
import type { Database, SearchPerformanceDetectorType } from "@/lib/supabase/types";

type ContentBriefRow = Database["public"]["Tables"]["content_briefs"]["Row"];

/**
 * The DB-touching half of brief creation — gathers every already-collected
 * signal for one seo_opportunities row (Phase 1-3 data, never anything
 * fabricated) and hands it to the pure buildContentBrief(). Synchronous, no
 * AI call — the async pipeline only starts once a human submits this brief
 * for generation (see lib/jobs/handlers/generate-content.ts).
 */
export async function createContentBriefForOpportunity(opportunityId: string): Promise<ContentBriefRow> {
  const opportunity = await getOpportunity(opportunityId);
  if (!opportunity) throw new Error(`seo_opportunity ${opportunityId} not found`);
  if (!isContentEligibleOpportunityType(opportunity.type)) {
    throw new Error(`Opportunity type ${opportunity.type} does not support content execution (only CREATE_NEW_PAGE/OPTIMISE_EXISTING_PAGE do).`);
  }

  const [website, detectorRow, task, otherPagesRaw, competitorPagesRaw] = await Promise.all([
    getWebsite(opportunity.website_id),
    getSearchPerformanceOpportunityBySeoOpportunityId(opportunity.id),
    getTaskForOpportunity(opportunity.id),
    listPagesForWebsite(opportunity.website_id),
    listCompetitorPagesWithDomainForWebsite(opportunity.website_id),
  ]);
  if (!website) throw new Error(`Website ${opportunity.website_id} not found`);
  const organization = await getOrganization(website.organization_id);
  if (!organization) throw new Error(`Organization ${website.organization_id} not found`);

  // Primary/secondary keywords: prefer the detector's own keyword_id (Phase
  // 2D/3-promoted opportunities), fall back to opportunity_keywords (Phase
  // 1/2B-promoted opportunities). Never invented if neither exists.
  const keywordIds = detectorRow?.keyword_id ? [detectorRow.keyword_id] : await listKeywordIdsForOpportunity(opportunity.id);
  const keywordRows = (await Promise.all(keywordIds.map((id) => getKeyword(id)))).filter((k): k is NonNullable<typeof k> => k !== null);
  const primaryKeywordRow = keywordRows[0] ?? null;
  const secondaryKeywordRows = keywordRows.slice(1, 1 + MAX_SECONDARY_KEYWORDS_IN_BRIEF);

  const existingPageRow = opportunity.type === "OPTIMISE_EXISTING_PAGE" && opportunity.target_page_id ? await getPageById(opportunity.target_page_id) : null;

  const [searchConsoleRows, keywordMetricsRow] = await Promise.all([
    listSearchConsoleMetricsForKeywordOrPage(website.id, { query: primaryKeywordRow?.keyword ?? null, pageUrl: existingPageRow?.url ?? null }),
    primaryKeywordRow ? getLatestKeywordMetrics(primaryKeywordRow.id) : Promise.resolve(null),
  ]);

  // Competitor pages: only genuine DIRECT_COMPETITOR domains ever inform
  // content strategy — directories/marketplaces/informational/other sites
  // are not meaningful "what should we cover" signals. The detector's own
  // named competitor (if any) is surfaced first.
  const namedCompetitorDomain = (detectorRow?.signals as Record<string, unknown> | null)?.competitorDomain;
  const directCompetitorPages = competitorPagesRaw
    .filter((p) => p.classification === "DIRECT_COMPETITOR")
    .sort((a, b) => (a.domain === namedCompetitorDomain ? -1 : b.domain === namedCompetitorDomain ? 1 : 0))
    .slice(0, MAX_COMPETITOR_PAGES_IN_BRIEF);

  const otherPages = otherPagesRaw
    .filter((p) => p.id !== existingPageRow?.id)
    .map((p) => ({ id: p.id, url: p.url, title: p.title, h1: p.h1, headings: p.headings.map((h) => h.text), metaDescription: p.meta_description }));

  const input: BuildContentBriefInput = {
    organization: { name: organization.name },
    website: {
      name: website.name,
      baseUrl: website.base_url,
      businessDescription: website.business_description,
      targetAudience: website.target_audience,
      brandVoice: website.brand_voice,
      contentConstraints: website.content_constraints,
    },
    opportunity: { id: opportunity.id, type: opportunity.type, title: opportunity.title, description: opportunity.description, rationale: opportunity.rationale },
    detector: detectorRow
      ? { detectorType: detectorRow.detector_type as SearchPerformanceDetectorType, signals: detectorRow.signals as Record<string, unknown>, reasoning: detectorRow.reasoning }
      : null,
    primaryKeyword: primaryKeywordRow ? { id: primaryKeywordRow.id, text: primaryKeywordRow.keyword, searchIntent: primaryKeywordRow.search_intent, location: primaryKeywordRow.country } : null,
    secondaryKeywords: secondaryKeywordRows.map((k) => ({ id: k.id, text: k.keyword })),
    existingPage: existingPageRow
      ? {
          id: existingPageRow.id,
          url: existingPageRow.url,
          title: existingPageRow.title,
          metaDescription: existingPageRow.meta_description,
          h1: existingPageRow.h1,
          headings: existingPageRow.headings.map((h) => h.text),
          wordCount: existingPageRow.word_count,
        }
      : null,
    otherPages,
    searchConsoleRows: searchConsoleRows.map((r) => ({ query: r.query, pageUrl: r.page_url, clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position })),
    keywordMetrics: keywordMetricsRow ? { searchVolume: keywordMetricsRow.search_volume, cpc: keywordMetricsRow.cpc, competition: keywordMetricsRow.competition } : null,
    competitorPages: directCompetitorPages.map((p) => ({ domain: p.domain, url: p.url, title: p.title, wordCount: p.wordCount, majorTopics: p.majorTopics })),
  };

  const brief: ContentBrief = buildContentBrief(input);

  return insertContentBrief({
    organizationId: organization.id,
    websiteId: website.id,
    seoOpportunityId: opportunity.id,
    seoTaskId: task?.id ?? null,
    primaryKeywordId: primaryKeywordRow?.id ?? null,
    primaryKeyword: primaryKeywordRow?.keyword ?? null,
    searchIntent: brief.searchIntent,
    targetUrl: brief.targetUrl,
    contentType: opportunity.type,
    briefData: brief as unknown as Record<string, unknown>,
  });
}
