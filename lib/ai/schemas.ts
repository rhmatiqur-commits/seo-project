import { z } from "zod";

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
