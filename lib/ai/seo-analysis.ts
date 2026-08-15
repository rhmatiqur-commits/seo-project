import { getAIProvider } from "@/lib/ai/get-provider";
import { opportunityAnalysisSchema, opportunityAnalysisJsonSchema, MAX_NEW_PAGES_PER_RUN } from "@/lib/ai/schemas";
import { OPPORTUNITY_PROMPT_VERSION, OPPORTUNITY_SYSTEM_PROMPT, buildOpportunityUserPrompt } from "@/lib/ai/prompts/opportunities";
import { listPagesForWebsite } from "@/lib/db/pages";
import { listIssuesForWebsite } from "@/lib/db/audits";
import { listActiveOpportunityTitles, insertOpportunity } from "@/lib/db/opportunities";
import { upsertKeyword, linkOpportunityKeyword } from "@/lib/db/keywords";
import { insertTask } from "@/lib/db/tasks";
import { createAiJob, completeAiJob } from "@/lib/db/ai-jobs";
import type { Database } from "@/lib/supabase/types";

type WebsiteRow = Database["public"]["Tables"]["websites"]["Row"];

export interface OpportunityGenerationResult {
  aiJobId: string;
  opportunitiesCreated: number;
  opportunitiesSkippedAsDuplicate: number;
  tasksCreated: number;
}

/** Case-insensitive, punctuation-light similarity check used to skip near-duplicate recommendations. */
function normalizeForDedupe(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function isDuplicateTitle(candidate: string, existing: string[]): boolean {
  const norm = normalizeForDedupe(candidate);
  return existing.some((e) => {
    const en = normalizeForDedupe(e);
    if (en === norm) return true;
    // Simple containment check catches near-identical intent ("Buy Running Shoes"
    // vs "Buy Running Shoes Online") without pulling in a fuzzy-matching dependency.
    return en.length > 8 && norm.length > 8 && (en.includes(norm) || norm.includes(en));
  });
}

function priorityScore(components: { business_relevance: number; search_intent_match: number; coverage_gap: number; commercial_value: number }, effort: "low" | "medium" | "high"): number {
  const effortPenalty = { low: 0, medium: 1, high: 2.5 }[effort];
  const raw =
    components.business_relevance * 1.5 +
    components.search_intent_match * 1.2 +
    components.coverage_gap * 1.0 +
    components.commercial_value * 1.3;
  return Math.max(0, Math.round((raw - effortPenalty) * 100) / 100);
}

/**
 * Runs the AI opportunity-generation pipeline for a website: builds a
 * structured (non-raw-HTML) summary from already-crawled/audited data, asks
 * the AI provider for recommendations, validates + dedupes them, and
 * persists each surviving recommendation as an seo_opportunities row plus a
 * linked seo_tasks row. Every AI call is logged to ai_jobs regardless of outcome.
 */
export async function generateSeoOpportunities(website: WebsiteRow, jobId: string | null): Promise<OpportunityGenerationResult> {
  const [pages, issues, existingTitles] = await Promise.all([
    listPagesForWebsite(website.id),
    listIssuesForWebsite(website.id),
    listActiveOpportunityTitles(website.id),
  ]);

  const issueCounts = new Map<string, { severity: string; count: number }>();
  for (const issue of issues) {
    const key = issue.issue_type;
    const existing = issueCounts.get(key);
    if (existing) existing.count++;
    else issueCounts.set(key, { severity: issue.severity, count: 1 });
  }

  const prompt = buildOpportunityUserPrompt({
    websiteName: website.name,
    baseUrl: website.base_url,
    pages: pages.map((p) => ({
      url: p.url,
      depth: p.depth,
      title: p.title,
      metaDescription: p.meta_description,
      h1: p.h1,
      wordCount: p.word_count,
      isOrphan: p.is_orphan,
      httpStatus: p.http_status,
    })),
    issueSummary: Array.from(issueCounts.entries()).map(([issueType, v]) => ({
      issueType,
      severity: v.severity,
      count: v.count,
    })),
    existingOpportunityTitles: existingTitles,
  });

  const aiJob = await createAiJob({
    organization_id: website.organization_id,
    job_id: jobId,
    provider: "anthropic",
    model: getAIProvider().defaultModel,
    prompt_version: OPPORTUNITY_PROMPT_VERSION,
    purpose: "opportunity_generation",
    // Counts only — never the raw page content — so we don't log sensitive client data.
    input_summary: { page_count: pages.length, issue_type_count: issueCounts.size, existing_opportunity_count: existingTitles.length },
    status: "PROCESSING",
  });

  try {
    const result = await getAIProvider().generateStructuredOutput({
      system: OPPORTUNITY_SYSTEM_PROMPT,
      prompt,
      schema: opportunityAnalysisSchema,
      jsonSchema: opportunityAnalysisJsonSchema,
      schemaName: "seo_opportunities",
    });

    await completeAiJob(aiJob.id, {
      status: "COMPLETED",
      result: { site_summary: result.data.site_summary, opportunity_count: result.data.opportunities.length },
      prompt_tokens: result.usage.promptTokens,
      completion_tokens: result.usage.completionTokens,
      total_tokens: result.usage.totalTokens,
      latency_ms: result.latencyMs,
    });

    const knownUrls = new Set(pages.map((p) => p.url));
    const pageIdByUrl = new Map(pages.map((p) => [p.url, p.id]));

    let opportunitiesCreated = 0;
    let opportunitiesSkippedAsDuplicate = 0;
    let tasksCreated = 0;
    let newPageCount = 0;
    const acceptedTitles = [...existingTitles];

    for (const draft of result.data.opportunities) {
      if (isDuplicateTitle(draft.title, acceptedTitles)) {
        opportunitiesSkippedAsDuplicate++;
        continue;
      }
      if (draft.type === "CREATE_NEW_PAGE") {
        if (newPageCount >= MAX_NEW_PAGES_PER_RUN) {
          opportunitiesSkippedAsDuplicate++; // capped, not a true duplicate, but still "not inserted"
          continue;
        }
        newPageCount++;
      }
      // target_url must reference a page we actually crawled; otherwise drop the reference
      // rather than trust an AI-hallucinated URL.
      const targetPageId = draft.target_url && knownUrls.has(draft.target_url) ? pageIdByUrl.get(draft.target_url) ?? null : null;

      const opportunity = await insertOpportunity({
        organization_id: website.organization_id,
        website_id: website.id,
        type: draft.type,
        title: draft.title,
        description: draft.description,
        rationale: draft.rationale,
        target_page_id: targetPageId,
        priority_score: priorityScore(draft.priority_components, draft.effort),
        priority_components: draft.priority_components,
        effort_estimate: draft.effort,
        ai_job_id: aiJob.id,
      });
      opportunitiesCreated++;
      acceptedTitles.push(draft.title);

      for (const kw of draft.target_keywords) {
        const keyword = await upsertKeyword(website.organization_id, website.id, kw, null, "ai_suggested");
        await linkOpportunityKeyword(opportunity.id, keyword.id);
      }

      await insertTask({
        organization_id: website.organization_id,
        website_id: website.id,
        opportunity_id: opportunity.id,
        title: draft.title,
        description: draft.description,
        type: draft.type,
        priority: Math.round(opportunity.priority_score),
      });
      tasksCreated++;
    }

    return { aiJobId: aiJob.id, opportunitiesCreated, opportunitiesSkippedAsDuplicate, tasksCreated };
  } catch (error) {
    await completeAiJob(aiJob.id, { status: "FAILED", error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}
