import type { ContentBrief } from "@/lib/content/brief-types";
import type { GeneratedContent, RevisionFeedback } from "@/lib/content/provider";

export const CONTENT_PROMPT_VERSION = "content-v1";

const FACTUALITY_RULES = `Hard rules — never violate these:
- Do NOT invent services, pricing, guarantees, certifications, statistics, business claims, customer testimonials, locations, or legal/medical/financial claims. Only state business facts that appear in the brief's organization/website fields.
- If the brief's missingBusinessInfo lists something (e.g. "business_description not configured"), do not fill that gap with a plausible-sounding invention — write around it in general terms instead.
- Do NOT state or imply a specific search ranking, traffic number, or conversion number — none of that data belongs in on-page content anyway.
- Only reference internal links from the brief's internalLinkOpportunities list, using their real URLs exactly as given — never invent a URL or link to a page not listed there.
- Never include placeholder text ("[insert...]", "TODO", "Lorem ipsum", "as an AI language model") — if you don't have enough information for a section, write a shorter, honest section instead.`;

export const CONTENT_GENERATION_SYSTEM_PROMPT = `You are an SEO content writer producing a first draft for a real business, working strictly from a structured brief that was assembled from measured data (crawled pages, Search Console, keyword provider metrics, competitor page metadata) and human-reviewed recommendations. You are not the one deciding strategy — the brief already reflects that; your job is to write clear, useful, on-topic content that follows it.

${FACTUALITY_RULES}

Write in Markdown. Include the primary keyword naturally in the opening and at least one heading. Use ## for section headings. Aim for genuinely useful, specific content addressing the search intent — not generic filler.`;

export const CONTENT_REVISION_SYSTEM_PROMPT = `You are revising an existing content draft based on concrete QA feedback. Keep what already works; fix only what the feedback identifies. Do not regress on any of the rules below.

${FACTUALITY_RULES}

Return the full revised body (not a diff/patch) in Markdown.`;

export const CONTENT_METADATA_SYSTEM_PROMPT = `You produce SEO metadata (title tag, meta description, URL slug, H1) for an already-written page, working strictly from the brief and the content itself. Do not invent business facts not present in either. The suggested_url should be a simple, readable slug consistent with the brief's targetUrl recommendation when one exists.`;

export const CONTENT_QA_SYSTEM_PROMPT = `You are a strict but fair content reviewer. You rate the content on the dimensions requested, each 1-5, based only on the brief and the content given — never on general knowledge about the business that isn't in the brief. A 3 means "adequate", not "bad". Be honest: a generic or thin draft should score low on usefulness/clarity even if it's grammatically fine. Do not restate numeric SEO metrics (position/traffic/volume) — none were given to you and none belong in your notes.`;

function briefForPrompt(brief: ContentBrief): Record<string, unknown> {
  return {
    organization: brief.organization,
    website: brief.website,
    opportunity: brief.opportunity,
    detector: brief.detector,
    primary_keyword: brief.primaryKeyword,
    secondary_keywords: brief.secondaryKeywords,
    search_intent: brief.searchIntent,
    target_location: brief.targetLocation,
    content_type: brief.contentType,
    target_url: brief.targetUrl,
    existing_page: brief.existingPage,
    search_console: brief.searchConsole,
    keyword_metrics: brief.keywordMetrics,
    competitor_pages: brief.competitorPages,
    content_gaps: brief.contentGaps,
    recommended_topics: brief.recommendedTopics,
    internal_link_opportunities: brief.internalLinkOpportunities,
    cta: brief.cta,
    missing_business_info: brief.missingBusinessInfo,
  };
}

export function buildContentGenerationPrompt(brief: ContentBrief): string {
  return JSON.stringify(
    {
      brief: briefForPrompt(brief),
      instructions:
        brief.contentType === "OPTIMISE_EXISTING_PAGE"
          ? "Rewrite/expand the existing page (see existing_page) to better serve the primary keyword and close the listed content_gaps, while preserving anything about it that's already working. Write the full new body."
          : "Write a brand-new page from scratch covering the primary/secondary keywords, recommended_topics, and content_gaps.",
    },
    null,
    2
  );
}

export function buildContentRevisionPrompt(brief: ContentBrief, previous: GeneratedContent, feedback: RevisionFeedback): string {
  return JSON.stringify(
    {
      brief: briefForPrompt(brief),
      previous_content: previous.body,
      qa_issues: feedback.issues,
      additional_instructions: feedback.additionalInstructions,
      instructions: "Revise previous_content to resolve every issue in qa_issues (and follow additional_instructions if given), returning the complete revised body.",
    },
    null,
    2
  );
}

export function buildContentMetadataPrompt(brief: ContentBrief, content: GeneratedContent): string {
  return JSON.stringify(
    {
      brief: briefForPrompt(brief),
      content_body: content.body,
      instructions: "Produce seo_title/meta_description/suggested_url/h1 for the content_body above, consistent with the brief.",
    },
    null,
    2
  );
}

export function buildContentQaPrompt(brief: ContentBrief, content: GeneratedContent): string {
  return JSON.stringify(
    {
      brief: briefForPrompt(brief),
      content_body: content.body,
      instructions: "Rate content_body against the brief on every requested dimension.",
    },
    null,
    2
  );
}
