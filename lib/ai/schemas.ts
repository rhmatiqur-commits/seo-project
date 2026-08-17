import { z } from "zod";
import { MAX_KEYWORDS_PER_DISCOVERY_RUN } from "@/lib/keywords/limits";
import { MAX_AI_INTERPRETATIONS_PER_RUN } from "@/lib/search-performance/limits";
import { MIN_SEO_TITLE_LENGTH, MAX_SEO_TITLE_LENGTH, MIN_META_DESCRIPTION_LENGTH, MAX_META_DESCRIPTION_LENGTH } from "@/lib/content/limits";
import { MAX_AI_INTERPRETATIONS_PER_RUN as MAX_OUTCOME_AI_INTERPRETATIONS_PER_RUN } from "@/lib/outcomes/limits";

/**
 * Structured output contract for the SEO opportunity-generation call.
 *
 * IMPORTANT (AI safety/quality constraints, enforced structurally):
 *  - There is no field anywhere here for search volume, rankings, or
 *    competitor metrics — the model cannot persist invented numbers because
 *    there's nowhere in the schema to put them.
 *  - `target_keywords` is a short list of phrases, not "verified" data.
 *  - Arrays are capped so a single run can't flood the platform with pages.
 *
 * Keep `opportunitySchema` and `opportunityJsonSchema` in sync — they
 * describe the same shape in two formats (zod for runtime validation,
 * JSON Schema for the Anthropic tool-use wire format).
 */

export const OPPORTUNITY_TYPES = [
  "CREATE_NEW_PAGE",
  "OPTIMISE_EXISTING_PAGE",
  "TECHNICAL_FIX",
  "INTERNAL_LINKING",
  "RESEARCH_REQUIRED",
] as const;

export const EFFORT_LEVELS = ["low", "medium", "high"] as const;

export const MAX_OPPORTUNITIES_PER_RUN = 15;
export const MAX_NEW_PAGES_PER_RUN = 5;
export const MAX_KEYWORDS_PER_OPPORTUNITY = 5;

const priorityComponentsSchema = z.object({
  business_relevance: z.number().int().min(1).max(5),
  search_intent_match: z.number().int().min(1).max(5),
  coverage_gap: z.number().int().min(1).max(5),
  commercial_value: z.number().int().min(1).max(5),
});

const opportunitySchema = z.object({
  type: z.enum(OPPORTUNITY_TYPES),
  title: z.string().min(5).max(150),
  description: z.string().min(10).max(1000),
  rationale: z.string().min(10).max(1000),
  // Must match a URL from the crawled-pages list given in the prompt, or null for a brand-new page.
  target_url: z.string().nullable(),
  target_keywords: z.array(z.string().min(2).max(80)).max(MAX_KEYWORDS_PER_OPPORTUNITY),
  effort: z.enum(EFFORT_LEVELS),
  priority_components: priorityComponentsSchema,
});

export const opportunityAnalysisSchema = z.object({
  site_summary: z.string().min(10).max(1500),
  opportunities: z.array(opportunitySchema).max(MAX_OPPORTUNITIES_PER_RUN),
});

export type OpportunityAnalysis = z.infer<typeof opportunityAnalysisSchema>;
export type OpportunityDraft = z.infer<typeof opportunitySchema>;

export const opportunityAnalysisJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["site_summary", "opportunities"],
  properties: {
    site_summary: {
      type: "string",
      description: "2-4 sentence plain-language summary of what this website's existing content covers.",
    },
    opportunities: {
      type: "array",
      maxItems: MAX_OPPORTUNITIES_PER_RUN,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "title", "description", "rationale", "target_url", "target_keywords", "effort", "priority_components"],
        properties: {
          type: { type: "string", enum: OPPORTUNITY_TYPES as unknown as string[] },
          title: { type: "string" },
          description: { type: "string" },
          rationale: {
            type: "string",
            description: "Why this matters, grounded in the crawled data provided — do not cite search volume, rankings, or competitor data you were not given.",
          },
          target_url: {
            type: ["string", "null"],
            description: "Must exactly match a URL from the provided page list, or null for CREATE_NEW_PAGE.",
          },
          target_keywords: {
            type: "array",
            maxItems: MAX_KEYWORDS_PER_OPPORTUNITY,
            items: { type: "string" },
            description: "Candidate topic/keyword phrases based on judgement, not measured search data.",
          },
          effort: { type: "string", enum: EFFORT_LEVELS as unknown as string[] },
          priority_components: {
            type: "object",
            additionalProperties: false,
            required: ["business_relevance", "search_intent_match", "coverage_gap", "commercial_value"],
            properties: {
              business_relevance: { type: "integer", minimum: 1, maximum: 5 },
              search_intent_match: { type: "integer", minimum: 1, maximum: 5 },
              coverage_gap: { type: "integer", minimum: 1, maximum: 5 },
              commercial_value: { type: "integer", minimum: 1, maximum: 5 },
            },
          },
        },
      },
    },
  },
} as const;

/**
 * Structured output contract for the KEYWORD_DISCOVERY job (Phase 2B).
 *
 * Same AI safety/quality constraints as the opportunity schema above: no
 * field anywhere for search volume, CPC, competition, or ranking data — the
 * model cannot persist invented metrics because there's nowhere to put them.
 * `difficulty` is explicitly an internal 1-5 judgement, not a measured
 * keyword-difficulty score. `most_relevant_existing_url` must match a URL
 * from the crawled-pages list given in the prompt, or null.
 */

export const KEYWORD_SEARCH_INTENTS = ["INFORMATIONAL", "COMMERCIAL", "TRANSACTIONAL", "NAVIGATIONAL", "LOCAL", "UNKNOWN"] as const;

const keywordSuggestionSchema = z.object({
  keyword: z.string().min(2).max(100),
  search_intent: z.enum(KEYWORD_SEARCH_INTENTS),
  business_relevance: z.number().int().min(1).max(5),
  commercial_value: z.number().int().min(1).max(5),
  difficulty: z.number().int().min(1).max(5),
  most_relevant_existing_url: z.string().nullable(),
  reasoning: z.string().min(10).max(500),
});

export const keywordDiscoveryAnalysisSchema = z.object({
  site_summary: z.string().min(10).max(1500),
  keyword_suggestions: z.array(keywordSuggestionSchema).max(MAX_KEYWORDS_PER_DISCOVERY_RUN),
});

export type KeywordDiscoveryAnalysis = z.infer<typeof keywordDiscoveryAnalysisSchema>;
export type KeywordSuggestionDraft = z.infer<typeof keywordSuggestionSchema>;

export const keywordDiscoveryAnalysisJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["site_summary", "keyword_suggestions"],
  properties: {
    site_summary: {
      type: "string",
      description: "2-4 sentence plain-language summary of the business and what its existing content covers.",
    },
    keyword_suggestions: {
      type: "array",
      maxItems: MAX_KEYWORDS_PER_DISCOVERY_RUN,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["keyword", "search_intent", "business_relevance", "commercial_value", "difficulty", "most_relevant_existing_url", "reasoning"],
        properties: {
          keyword: { type: "string", description: "A specific, realistic search phrase — not a single generic word." },
          search_intent: { type: "string", enum: KEYWORD_SEARCH_INTENTS as unknown as string[] },
          business_relevance: { type: "integer", minimum: 1, maximum: 5 },
          commercial_value: { type: "integer", minimum: 1, maximum: 5 },
          difficulty: {
            type: "integer",
            minimum: 1,
            maximum: 5,
            description: "Your own internal estimate of how hard this would be to rank for, based only on the site data given — not a measured keyword-difficulty score.",
          },
          most_relevant_existing_url: {
            type: ["string", "null"],
            description: "Must exactly match a URL from the provided page list if one is genuinely relevant, otherwise null.",
          },
          reasoning: {
            type: "string",
            description: "Why this keyword matters and why the page match (or lack of one) was chosen, grounded only in the data provided.",
          },
        },
      },
    },
  },
} as const;

/**
 * Structured output contract for ANALYSE_SEARCH_PERFORMANCE's optional AI
 * interpretation pass (Phase 2D). All numeric detection/scoring already
 * happened deterministically in TypeScript before this call — the AI's job
 * is strictly interpretation, never calculation.
 *
 * AI safety constraints, enforced structurally: no field anywhere for clicks,
 * impressions, position, CTR, search volume, or any other number the model
 * might be tempted to recompute or invent — every input number is already
 * final, and this schema has nowhere for the model to output a competing one.
 * `opportunity_id` lets the handler map each interpretation back to the
 * search_performance_opportunities row it belongs to.
 */

const searchPerformanceInterpretationItemSchema = z.object({
  opportunity_id: z.string().min(1),
  rationale: z.string().min(10).max(800),
  content_direction: z.string().min(5).max(500),
  suggested_page_note: z.string().max(300).nullable(),
  risk_notes: z.string().max(500).nullable(),
  cannibalisation_risk: z.boolean(),
});

export const searchPerformanceInterpretationSchema = z.object({
  interpretations: z.array(searchPerformanceInterpretationItemSchema).max(MAX_AI_INTERPRETATIONS_PER_RUN),
});

export type SearchPerformanceInterpretation = z.infer<typeof searchPerformanceInterpretationSchema>;
export type SearchPerformanceInterpretationItem = z.infer<typeof searchPerformanceInterpretationItemSchema>;

export const searchPerformanceInterpretationJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["interpretations"],
  properties: {
    interpretations: {
      type: "array",
      maxItems: MAX_AI_INTERPRETATIONS_PER_RUN,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["opportunity_id", "rationale", "content_direction", "suggested_page_note", "risk_notes", "cannibalisation_risk"],
        properties: {
          opportunity_id: { type: "string", description: "Must exactly match the id of one of the opportunities given in the prompt." },
          rationale: { type: "string", description: "Why this opportunity matters, grounded only in the deterministic signals provided — do not restate or recompute the numbers, explain their significance." },
          content_direction: { type: "string", description: "Concrete guidance on what content/change to make. No invented data." },
          suggested_page_note: { type: ["string", "null"], description: "A short note on which page to work on and why, or null if the given page_id already makes this obvious." },
          risk_notes: { type: ["string", "null"], description: "Risks such as keyword cannibalisation with another known page/keyword, or null if none apply." },
          cannibalisation_risk: { type: "boolean", description: "True only if you have a concrete reason to suspect this from the data given, not a default guess." },
        },
      },
    },
  },
} as const;

/**
 * Structured output contract for ContentProvider.generateMetadata (Phase 4).
 * Small and fully structured on purpose — title/meta description/URL/H1 are
 * exactly the kind of bounded shape generateStructuredOutput is for, unlike
 * the free-form body text (generated via generateText instead).
 */

export const contentMetadataSchema = z.object({
  seo_title: z.string().min(MIN_SEO_TITLE_LENGTH).max(MAX_SEO_TITLE_LENGTH),
  meta_description: z.string().min(MIN_META_DESCRIPTION_LENGTH).max(MAX_META_DESCRIPTION_LENGTH),
  suggested_url: z.string().min(1).max(200),
  h1: z.string().min(3).max(150),
});

export type ContentMetadataDraft = z.infer<typeof contentMetadataSchema>;

export const contentMetadataJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["seo_title", "meta_description", "suggested_url", "h1"],
  properties: {
    seo_title: { type: "string", description: `The <title> tag text, ${MIN_SEO_TITLE_LENGTH}-${MAX_SEO_TITLE_LENGTH} characters, including the primary keyword naturally.` },
    meta_description: { type: "string", description: `The meta description, ${MIN_META_DESCRIPTION_LENGTH}-${MAX_META_DESCRIPTION_LENGTH} characters, a genuine summary of the page — no invented offers/claims.` },
    suggested_url: { type: "string", description: "A lowercase, hyphenated URL slug (path only, no domain) consistent with the brief's targetUrl recommendation." },
    h1: { type: "string", description: "The on-page H1 heading — may differ slightly from seo_title for readability." },
  },
} as const;

/**
 * Structured output contract for the AI-assisted half of content QA (Phase
 * 4). Deliberately bounded 1-5 categorical ratings + booleans + free text —
 * no numeric "score" field anywhere: the composite pass/fail score is always
 * computed in TypeScript (lib/content/qa/compute-result.ts) from these
 * ratings plus the deterministic checks, never returned by the model
 * directly. "Do NOT use AI for simple numerical calculations."
 */

export const contentQaSchema = z.object({
  search_intent_alignment: z.number().int().min(1).max(5),
  topical_coverage: z.number().int().min(1).max(5),
  usefulness: z.number().int().min(1).max(5),
  clarity: z.number().int().min(1).max(5),
  business_relevance: z.number().int().min(1).max(5),
  competitor_gap_coverage: z.number().int().min(1).max(5),
  addresses_likely_question: z.boolean(),
  feels_generic_or_repetitive: z.boolean(),
  notes: z.string().min(5).max(800),
});

export type ContentQaDraft = z.infer<typeof contentQaSchema>;

export const contentQaJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "search_intent_alignment",
    "topical_coverage",
    "usefulness",
    "clarity",
    "business_relevance",
    "competitor_gap_coverage",
    "addresses_likely_question",
    "feels_generic_or_repetitive",
    "notes",
  ],
  properties: {
    search_intent_alignment: { type: "integer", minimum: 1, maximum: 5, description: "Does the content match the brief's search_intent (informational/commercial/transactional/etc)?" },
    topical_coverage: { type: "integer", minimum: 1, maximum: 5, description: "Does it cover the brief's recommendedTopics/contentGaps adequately?" },
    usefulness: { type: "integer", minimum: 1, maximum: 5, description: "Would a real visitor searching this keyword find this genuinely useful?" },
    clarity: { type: "integer", minimum: 1, maximum: 5, description: "Is it clearly written and well-structured?" },
    business_relevance: { type: "integer", minimum: 1, maximum: 5, description: "Does it stay relevant to the website's actual business, based only on the brief's business fields?" },
    competitor_gap_coverage: { type: "integer", minimum: 1, maximum: 5, description: "If the brief lists competitor content gaps, does this content close them? 3 (neutral) if the brief lists none." },
    addresses_likely_question: { type: "boolean", description: "Does the content actually answer the question/need implied by the primary keyword?" },
    feels_generic_or_repetitive: { type: "boolean", description: "True if the content reads as generic filler or repeats itself rather than saying something concrete." },
    notes: { type: "string", description: "1-3 sentences of concrete, actionable feedback — this becomes revision guidance if QA fails. Never state a specific ranking/traffic number." },
  },
} as const;

/**
 * Structured output contract for ANALYSE_ACTION_OUTCOMES' optional AI
 * interpretation pass (Phase 6). Every deterministic number — the baseline,
 * the current metrics, the deltas, the classification, the recommendation —
 * was already computed in TypeScript (lib/outcomes/*) before this call. The
 * AI's job is strictly interpretation, same "TypeScript calculates, AI
 * interprets" principle as Phase 2D's search-performance pass.
 *
 * AI safety constraints, enforced structurally: no field anywhere for
 * clicks, impressions, position, CTR, or any percentage/number the model
 * might be tempted to recompute or invent; no field that could restate or
 * override `classification`/`recommendation` (those are read-only inputs to
 * the prompt, never outputs here) — the model cannot mark an
 * INSUFFICIENT_DATA outcome as anything else because there is nowhere in
 * this schema to say so. `outcome_id` lets the handler map each
 * interpretation back to the seo_action_outcomes row it belongs to.
 */

const actionOutcomeInterpretationItemSchema = z.object({
  outcome_id: z.string().min(1),
  interpretation: z.string().min(10).max(800),
  next_step_note: z.string().min(5).max(500),
  risk_notes: z.string().max(500).nullable(),
  competitor_context_note: z.string().max(400).nullable(),
});

export const actionOutcomeInterpretationSchema = z.object({
  interpretations: z.array(actionOutcomeInterpretationItemSchema).max(MAX_OUTCOME_AI_INTERPRETATIONS_PER_RUN),
});

export type ActionOutcomeInterpretation = z.infer<typeof actionOutcomeInterpretationSchema>;
export type ActionOutcomeInterpretationItem = z.infer<typeof actionOutcomeInterpretationItemSchema>;

export const actionOutcomeInterpretationJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["interpretations"],
  properties: {
    interpretations: {
      type: "array",
      maxItems: MAX_OUTCOME_AI_INTERPRETATIONS_PER_RUN,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["outcome_id", "interpretation", "next_step_note", "risk_notes", "competitor_context_note"],
        properties: {
          outcome_id: { type: "string", description: "Must exactly match the id of one of the outcomes given in the prompt." },
          interpretation: {
            type: "string",
            description:
              "Plain-language explanation of why this result may have happened, grounded only in the deterministic classification/deltas/signals given. Use cautious, observational language ('may explain', 'is consistent with') — never state that this action caused a specific outcome as established fact.",
          },
          next_step_note: {
            type: "string",
            description: "What's worth investigating or doing next, consistent with (never contradicting) the already-assigned recommendation given in the prompt.",
          },
          risk_notes: { type: ["string", "null"], description: "Risks or caveats worth flagging (e.g. sample still thin, seasonality, a concurrent change elsewhere), or null if none apply." },
          competitor_context_note: {
            type: ["string", "null"],
            description: "Only non-null if the prompt's competitor_context actually gives you something concrete to reference — never invent or assume competitor activity you weren't told about.",
          },
        },
      },
    },
  },
} as const;
