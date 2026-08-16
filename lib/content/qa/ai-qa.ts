import { getAIProvider } from "@/lib/ai/get-provider";
import { contentQaSchema, contentQaJsonSchema, type ContentQaDraft } from "@/lib/ai/schemas";
import { CONTENT_QA_SYSTEM_PROMPT, buildContentQaPrompt, CONTENT_PROMPT_VERSION } from "@/lib/ai/prompts/content";
import { createAiJob, completeAiJob } from "@/lib/db/ai-jobs";
import type { ContentBrief } from "@/lib/content/brief-types";
import type { GeneratedContent } from "@/lib/content/provider";

export interface AiQaResult {
  ai: ContentQaDraft | null;
  aiJobId: string | null;
  model: string | null;
  promptVersion: string | null;
}

/**
 * The AI-assisted half of content QA — one structured-output call rating the
 * draft against the brief. Soft-failing (try/catch), same pattern as
 * lib/jobs/handlers/search-performance-shared.ts's runAiInterpretationPass:
 * a failed/skipped call never blocks QA, it just means the result is
 * deterministic-only. Every call is logged via the existing ai_jobs tracker
 * (provider/model/tokens/latency) — no separate cost-tracking mechanism.
 */
export async function runContentAiQa(
  organizationId: string,
  jobId: string,
  brief: ContentBrief,
  content: GeneratedContent
): Promise<AiQaResult> {
  const provider = getAIProvider();
  const aiJob = await createAiJob({
    organization_id: organizationId,
    job_id: jobId,
    provider: provider.name,
    model: provider.defaultModel,
    prompt_version: CONTENT_PROMPT_VERSION,
    purpose: "content_qa",
    input_summary: { content_brief_opportunity_id: brief.opportunity.id },
    status: "PROCESSING",
  });

  try {
    const result = await provider.generateStructuredOutput({
      system: CONTENT_QA_SYSTEM_PROMPT,
      prompt: buildContentQaPrompt(brief, content),
      schema: contentQaSchema,
      jsonSchema: contentQaJsonSchema,
      schemaName: "content_qa",
    });
    await completeAiJob(aiJob.id, {
      status: "COMPLETED",
      result: { ...result.data },
      prompt_tokens: result.usage.promptTokens,
      completion_tokens: result.usage.completionTokens,
      total_tokens: result.usage.totalTokens,
      latency_ms: result.latencyMs,
    });
    return { ai: result.data, aiJobId: aiJob.id, model: result.model, promptVersion: CONTENT_PROMPT_VERSION };
  } catch (error) {
    await completeAiJob(aiJob.id, { status: "FAILED", error: error instanceof Error ? error.message : String(error) });
    console.warn(`[content] AI QA failed for opportunity ${brief.opportunity.id}, continuing deterministic-only:`, error);
    return { ai: null, aiJobId: null, model: null, promptVersion: null };
  }
}
