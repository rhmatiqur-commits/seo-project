import { normalizeKeyword } from "@/lib/keywords/normalize";
import { findBestPageMatch, scorePageMatch, type MatchablePage } from "@/lib/keywords/matching";
import { MIN_PAGE_MATCH_RELEVANCE } from "@/lib/keywords/limits";
import {
  MAX_COMPETITOR_PAGES_IN_BRIEF,
  MAX_SEARCH_CONSOLE_ROWS_IN_BRIEF,
  MAX_SECONDARY_KEYWORDS_IN_BRIEF,
  MAX_INTERNAL_LINK_OPPORTUNITIES_IN_BRIEF,
  MAX_CONTENT_GAPS_IN_BRIEF,
  MAX_RECOMMENDED_TOPICS_IN_BRIEF,
} from "@/lib/content/limits";
import type {
  ContentBrief,
  ContentBriefCompetitorPage,
  ContentBriefExistingPage,
  ContentBriefInternalLinkOpportunity,
  ContentBriefKeyword,
  ContentBriefKeywordMetrics,
  ContentBriefSearchConsoleRow,
} from "@/lib/content/brief-types";
import type { OpportunityType, SearchPerformanceDetectorType } from "@/lib/supabase/types";

/**
 * Every field here is pre-fetched, plain data — this module does zero DB/AI
 * work, so it's fully unit-testable with plain objects (same convention as
 * every other pure builder in this codebase). The caller (a server action)
 * is responsible for gathering all of this first.
 */
export interface BuildContentBriefInput {
  organization: { name: string };
  website: {
    name: string;
    baseUrl: string;
    businessDescription: string | null;
    targetAudience: string | null;
    brandVoice: string | null;
    contentConstraints: string | null;
  };
  opportunity: {
    id: string;
    type: OpportunityType;
    title: string;
    description: string;
    rationale: string;
  };
  detector: { detectorType: SearchPerformanceDetectorType; signals: Record<string, unknown>; reasoning: string } | null;
  primaryKeyword: { id: string; text: string; searchIntent: string | null; location: string | null } | null;
  secondaryKeywords: ContentBriefKeyword[];
  existingPage: (ContentBriefExistingPage & MatchablePage) | null;
  /** Every other crawled page — internal-link candidates are scored against these, excluding existingPage. */
  otherPages: (MatchablePage & { id: string; url: string; title: string | null })[];
  searchConsoleRows: ContentBriefSearchConsoleRow[];
  keywordMetrics: ContentBriefKeywordMetrics | null;
  competitorPages: ContentBriefCompetitorPage[];
}

/** A simple, honest URL-slug recommendation for a brand-new page — a
 * recommendation, not a guarantee of final placement (surfaced as such in
 * the brief). Never used when optimising an existing page (its real URL is
 * used instead). */
export function suggestUrlSlug(primaryKeywordText: string, baseUrl: string): string {
  const slug = normalizeKeyword(primaryKeywordText)
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
  const origin = baseUrl.replace(/\/+$/, "");
  return `${origin}/${slug || "new-page"}`;
}

function computeInternalLinkOpportunities(
  primaryKeywordText: string | null,
  otherPages: (MatchablePage & { id: string; url: string; title: string | null })[]
): ContentBriefInternalLinkOpportunity[] {
  if (!primaryKeywordText) return [];
  return otherPages
    .map((page) => ({ page, ...scorePageMatch(primaryKeywordText, page) }))
    .filter((m) => m.matchType !== "none" && m.relevanceScore >= MIN_PAGE_MATCH_RELEVANCE)
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, MAX_INTERNAL_LINK_OPPORTUNITIES_IN_BRIEF)
    .map((m) => ({
      sourcePageUrl: m.page.url,
      sourcePageTitle: m.page.title,
      relevanceScore: m.relevanceScore,
      anchorTextSuggestion: primaryKeywordText,
    }));
}

function computeContentGaps(detector: BuildContentBriefInput["detector"], competitorPages: ContentBriefCompetitorPage[]): string[] {
  const gaps: string[] = [];
  if (detector) gaps.push(detector.reasoning);
  for (const page of competitorPages.slice(0, MAX_CONTENT_GAPS_IN_BRIEF)) {
    if (page.majorTopics.length === 0) continue;
    gaps.push(`${page.domain} (${page.url}) covers: ${page.majorTopics.join(", ")}.`);
  }
  return gaps.slice(0, MAX_CONTENT_GAPS_IN_BRIEF);
}

function computeRecommendedTopics(competitorPages: ContentBriefCompetitorPage[]): string[] {
  const seen = new Set<string>();
  const topics: string[] = [];
  for (const page of competitorPages) {
    for (const topic of page.majorTopics) {
      const key = normalizeKeyword(topic);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      topics.push(topic);
      if (topics.length >= MAX_RECOMMENDED_TOPICS_IN_BRIEF) return topics;
    }
  }
  return topics;
}

function computeMissingBusinessInfo(input: BuildContentBriefInput): string[] {
  const missing: string[] = [];
  if (!input.website.businessDescription) missing.push("business_description is not configured for this website — do not invent what the business does or offers.");
  if (!input.website.targetAudience) missing.push("target_audience is not configured for this website.");
  if (!input.website.brandVoice) missing.push("brand_voice is not configured for this website — a neutral, professional tone should be used.");
  if (!input.website.contentConstraints) missing.push("no content_constraints (e.g. required disclaimers, things never to claim) are configured for this website.");
  if (!input.primaryKeyword) missing.push("no primary keyword could be resolved for this opportunity.");
  if (!input.keywordMetrics || (input.keywordMetrics.searchVolume === null && input.keywordMetrics.cpc === null)) {
    missing.push("no keyword-provider metrics (search volume/CPC/competition) are available for the primary keyword.");
  }
  if (input.searchConsoleRows.length === 0) missing.push("no Search Console data is available for this keyword/page.");
  return missing;
}

export function buildContentBrief(input: BuildContentBriefInput): ContentBrief {
  const primaryKeywordText = input.primaryKeyword?.text ?? null;
  const targetUrl =
    input.opportunity.type === "OPTIMISE_EXISTING_PAGE"
      ? (input.existingPage?.url ?? null)
      : primaryKeywordText
        ? suggestUrlSlug(primaryKeywordText, input.website.baseUrl)
        : null;

  const otherPagesExcludingExisting = input.existingPage ? input.otherPages.filter((p) => p.id !== (input.existingPage as { id?: string }).id) : input.otherPages;

  return {
    organization: input.organization,
    website: {
      name: input.website.name,
      baseUrl: input.website.baseUrl,
      businessDescription: input.website.businessDescription,
      targetAudience: input.website.targetAudience,
      brandVoice: input.website.brandVoice,
      contentConstraints: input.website.contentConstraints,
    },
    opportunity: {
      id: input.opportunity.id,
      type: input.opportunity.type,
      title: input.opportunity.title,
      description: input.opportunity.description,
      rationale: input.opportunity.rationale,
    },
    detector: input.detector
      ? { detectorType: input.detector.detectorType, signals: input.detector.signals, reasoning: input.detector.reasoning }
      : null,
    primaryKeyword: input.primaryKeyword ? { id: input.primaryKeyword.id, text: input.primaryKeyword.text } : null,
    secondaryKeywords: input.secondaryKeywords.slice(0, MAX_SECONDARY_KEYWORDS_IN_BRIEF),
    searchIntent: input.primaryKeyword?.searchIntent ?? null,
    targetLocation: input.primaryKeyword?.location ?? null,
    contentType: input.opportunity.type,
    targetUrl,
    existingPage: input.existingPage
      ? {
          id: input.existingPage.id,
          url: input.existingPage.url,
          title: input.existingPage.title,
          metaDescription: input.existingPage.metaDescription,
          h1: input.existingPage.h1,
          headings: input.existingPage.headings,
          wordCount: input.existingPage.wordCount,
        }
      : null,
    searchConsole: input.searchConsoleRows.slice(0, MAX_SEARCH_CONSOLE_ROWS_IN_BRIEF),
    keywordMetrics: input.keywordMetrics,
    competitorPages: input.competitorPages.slice(0, MAX_COMPETITOR_PAGES_IN_BRIEF),
    contentGaps: computeContentGaps(input.detector, input.competitorPages),
    recommendedTopics: computeRecommendedTopics(input.competitorPages),
    internalLinkOpportunities: computeInternalLinkOpportunities(primaryKeywordText, otherPagesExcludingExisting),
    // No CTA data source exists anywhere in this platform yet — left null
    // rather than guessed; covered by missingBusinessInfo below.
    cta: null,
    missingBusinessInfo: [...computeMissingBusinessInfo(input), "cta is not configured — no explicit call-to-action guidance is available for this website."],
  };
}
