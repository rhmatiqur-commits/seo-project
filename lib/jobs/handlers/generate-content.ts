import { createJob } from "@/lib/db/jobs";
import { getContentJob, getContentBrief, insertContentVersion, updateContentJobStatus, getLatestContentVersionForBrief } from "@/lib/db/content";
import { createAiJob, completeAiJob } from "@/lib/db/ai-jobs";
import { getContentProvider } from "@/lib/content/get-provider";
import { CONTENT_PROMPT_VERSION } from "@/lib/ai/prompts/content";
import { canTransitionContentJob } from "@/lib/content/state-machine";
import type { ContentBrief } from "@/lib/content/brief-types";
import type { JobHandler } from "@/lib/jobs/types";

/**
 * GENERATE_CONTENT: loads the (already-built, human-reviewed) content brief,
 * calls the configured ContentProvider for a first draft + metadata, stores
 * version 1, and chains into QA_CONTENT — scoped to this content_job_id
 * (never the generic website-scoped advancePipeline; see
 * lib/jobs/policy.ts's getNextJobType, which deliberately returns null for
 * this job type).
 */
export const handleGenerateContent: JobHandler = async ({ job }) => {
  const payload = job.payload as { content_job_id?: string } | null;
  const contentJobId = payload?.content_job_id;
  if (!contentJobId) throw new Error("GENERATE_CONTENT job is missing payload.content_job_id");

  const contentJob = await getContentJob(contentJobId);
  if (!contentJob) throw new Error(`content_job ${contentJobId} not found`);

  const brief = await getContentBrief(contentJob.content_brief_id);
  if (!brief) throw new Error(`content_brief ${contentJob.content_brief_id} not found`);

  const briefData = brief.brief_data as unknown as ContentBrief;
  const provider = getContentProvider();

  try {
    const generationAiJob = await createAiJob({
      organization_id: contentJob.organization_id,
      job_id: job.id,
      provider: provider.name,
      model: provider.defaultModel,
      prompt_version: CONTENT_PROMPT_VERSION,
      purpose: "content_generation",
      input_summary: { content_brief_id: brief.id, opportunity_id: briefData.opportunity.id },
      status: "PROCESSING",
    });
    const generation = await provider.generateContent(briefData);
    await completeAiJob(generationAiJob.id, {
      status: "COMPLETED",
      result: { word_count: generation.content.body.trim().split(/\s+/).length },
      prompt_tokens: generation.usage.promptTokens,
      completion_tokens: generation.usage.completionTokens,
      total_tokens: generation.usage.totalTokens,
      latency_ms: generation.latencyMs,
    });

    const metadataAiJob = await createAiJob({
      organization_id: contentJob.organization_id,
      job_id: job.id,
      provider: provider.name,
      model: "unknown",
      prompt_version: CONTENT_PROMPT_VERSION,
      purpose: "content_metadata",
      input_summary: { content_brief_id: brief.id },
      status: "PROCESSING",
    });
    const metadata = await provider.generateMetadata(briefData, generation.content);
    await completeAiJob(metadataAiJob.id, {
      status: "COMPLETED",
      result: { suggested_url: metadata.metadata.suggestedUrl },
      prompt_tokens: metadata.usage.promptTokens,
      completion_tokens: metadata.usage.completionTokens,
      total_tokens: metadata.usage.totalTokens,
      latency_ms: metadata.latencyMs,
    });

    const existingLatest = await getLatestContentVersionForBrief(brief.id);
    const versionNumber = (existingLatest?.version_number ?? 0) + 1;

    const version = await insertContentVersion({
      organizationId: contentJob.organization_id,
      websiteId: contentJob.website_id,
      contentBriefId: brief.id,
      contentJobId: contentJob.id,
      versionNumber,
      title: metadata.metadata.seoTitle,
      content: generation.content.body,
      metadata: { ...metadata.metadata },
    });

    if (!canTransitionContentJob(contentJob.status, "QA_PENDING")) {
      throw new Error(`content_job ${contentJob.id} cannot move from ${contentJob.status} to QA_PENDING`);
    }
    await updateContentJobStatus(contentJob.id, "QA_PENDING", { startedAt: contentJob.started_at ?? new Date().toISOString() });

    const { created } = await createJob({
      organization_id: contentJob.organization_id,
      website_id: contentJob.website_id,
      job_type: "QA_CONTENT",
      payload: { content_job_id: contentJob.id },
      idempotency_key: `QA_CONTENT:${contentJob.id}`,
    });

    return { contentJobId: contentJob.id, versionId: version.id, versionNumber, qaJobCreated: created };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateContentJobStatus(contentJob.id, contentJob.status, { error: message });
    throw error;
  }
};
