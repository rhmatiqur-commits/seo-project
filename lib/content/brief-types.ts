import type { OpportunityType, SearchPerformanceDetectorType } from "@/lib/supabase/types";

/**
 * The structured content brief (Phase 4). Every field is either measured
 * (crawled/AI-judged/provider data already collected by Phases 1–3, cited by
 * its source) or explicitly a recommendation computed in this file's
 * builder — never a business fact invented on the fly. Fields that would
 * require real business information we don't have are surfaced via
 * `missingBusinessInfo` rather than left silently blank.
 */

export interface ContentBriefOrganization {
  name: string;
}

export interface ContentBriefWebsite {
  name: string;
  baseUrl: string;
  /** Business-fact fields — null means "not configured", surfaced in missingBusinessInfo, never guessed. */
  businessDescription: string | null;
  targetAudience: string | null;
  brandVoice: string | null;
  contentConstraints: string | null;
}

export interface ContentBriefOpportunity {
  id: string;
  type: OpportunityType;
  title: string;
  description: string;
  rationale: string;
}

/** Present only when the originating seo_opportunity was promoted from the
 * Phase 2D/3 detector pipeline (search_performance_opportunities) — Phase
 * 1/2B-originated opportunities have no detector-level signal data. */
export interface ContentBriefDetectorContext {
  detectorType: SearchPerformanceDetectorType;
  signals: Record<string, unknown>;
  reasoning: string;
}

export interface ContentBriefKeyword {
  id: string;
  text: string;
}

/** Real provider metrics (Phase 2B) — null fields mean "no measurement was
 * ever collected," not zero. */
export interface ContentBriefKeywordMetrics {
  searchVolume: number | null;
  cpc: number | null;
  competition: number | null;
}

export interface ContentBriefExistingPage {
  id: string;
  url: string;
  title: string | null;
  metaDescription: string | null;
  h1: string | null;
  headings: string[];
  wordCount: number | null;
}

/** Real, measured Google Search Console rows (Phase 2C) for the primary keyword/page. */
export interface ContentBriefSearchConsoleRow {
  query: string | null;
  pageUrl: string | null;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number | null;
}

/** Structured metadata only — never body text/raw HTML (same rule as
 * competitor_pages in Phase 3). */
export interface ContentBriefCompetitorPage {
  domain: string;
  url: string;
  title: string | null;
  wordCount: number | null;
  majorTopics: string[];
}

/** Always a real, existing website_pages URL — computed via
 * lib/keywords/matching.ts's scorePageMatch, never invented. */
export interface ContentBriefInternalLinkOpportunity {
  sourcePageUrl: string;
  sourcePageTitle: string | null;
  relevanceScore: number;
  anchorTextSuggestion: string;
}

export interface ContentBrief {
  organization: ContentBriefOrganization;
  website: ContentBriefWebsite;
  opportunity: ContentBriefOpportunity;
  detector: ContentBriefDetectorContext | null;
  primaryKeyword: ContentBriefKeyword | null;
  secondaryKeywords: ContentBriefKeyword[];
  searchIntent: string | null;
  targetLocation: string | null;
  contentType: OpportunityType;
  /** Recommended URL for a new page, or the existing page's real URL when optimising. */
  targetUrl: string | null;
  existingPage: ContentBriefExistingPage | null;
  searchConsole: ContentBriefSearchConsoleRow[];
  keywordMetrics: ContentBriefKeywordMetrics | null;
  competitorPages: ContentBriefCompetitorPage[];
  /** Free-text recommendations — gaps identified relative to competitor coverage. */
  contentGaps: string[];
  /** Free-text recommended headings/topics to cover — a recommendation, not a requirement the model must match verbatim. */
  recommendedTopics: string[];
  internalLinkOpportunities: ContentBriefInternalLinkOpportunity[];
  /** A recommendation only — null when no CTA guidance is available. */
  cta: string | null;
  /** Explicit list of business facts the brief could not populate (e.g. "business_description not configured") — read by both the human reviewer and the QA factuality safeguard. */
  missingBusinessInfo: string[];
}
