import { createJob } from "@/lib/db/jobs";
import {
  getContentJob,
  getContentBrief,
  getLatestContentVersionForBrief,
  getLatestQaResultForVersion,
  insertContentVersion,
  updateContentJobStatus,
} from "@/lib/db/content";
import { createAiJob, completeAiJob } from "@/lib/db/ai-jobs";
import { getContentProvider } from "@/lib/content/get-provider";
import { CONTENT_PROMPT_VERSION } from "@/lib/ai/prompts/content";
import { canTransitionContentJob } from "@/lib/content/state-machine";
import type { ContentBrief } from "@/lib/content/brief-types";
import type { RevisionFeedback } from "@/lib/content/provider";
import type { JobHandler } from "@/lib/jobs/types";

/**
 * REVISE_CONTENT: takes the latest version + its QA feedback (or a human's
 * free-text instructions, for a manual revision) and produces a new
 * content_versions row via ContentProvider.reviseContent, then chains back
 * into QA_CONTENT. Runs whether it was auto-chained by a failed QA_CONTENT
 * or manually triggered by a human from any state the state-machine allows
 * (see lib/content/state-machine.ts) — MAX_CONTENT_REVISIONS is enforced by
 * QA_CONTENT's decision to auto-chain here, not by this handler itself; a
 * human clicking "Revise" is an explicit override, not the automatic loop.
 */
export const handleReviseContent: JobHandler = async ({ job }) => {
  const payload = job.payload as { content_job_id?: string; additional_instructions?: string } | null;
  const contentJobId = payload?.content_job_id;
  if (!contentJobId) throw new Error("REVISE_CONTENT job is missing payload.content_job_id");

  const contentJob = await getContentJob(contentJobId);
  if (!contentJob) throw new Error(`content_job ${contentJobId} not found`);

  if (!canTransitionContentJob(contentJob.status, "QA_PENDING")) {
    throw new Error(`content_job ${contentJob.id} cannot be revised from status ${contentJob.status}`);
  }

  const brief = await getContentBrief(contentJob.content_brief_id);
  if (!brief) throw new Error(`content_brief ${contentJob.content_brief_id} not found`);

  const previousVersion = await getLatestContentVersionForBrief(brief.id);
  if (!previousVersion) throw new Error(`No content_versions row exists yet for content_brief ${brief.id}`);

  try {
    const briefData = brief.brief_data as unknown as ContentBrief;
    const previousQa = await getLatestQaResultForVersion(previousVersion.id);
    const feedback: RevisionFeedback = {
      issues: previousQa ? (previousQa.issues as unknown as { message: string }[]).map((i) => i.message) : [],
      additionalInstructions: payload?.additional_instructions ?? null,
    };

    const provider = getContentProvider();
    const revisionAiJob = await createAiJob({
      organization_id: contentJob.organization_id,
      job_id: job.id,
      provider: provider.name,
      model: provider.defaultModel,
      prompt_version: CONTENT_PROMPT_VERSION,
      purpose: "content_revision",
      input_summary: { content_brief_id: brief.id, previous_version_id: previousVersion.id, issue_count: feedback.issues.length },
      status: "PROCESSING",
    });
    const revision = await provider.reviseContent({ body: previousVersion.content }, feedback, briefData);
    await completeAiJob(revisionAiJob.id, {
      status: "COMPLETED",
      result: { word_count: revision.content.body.trim().split(/\s+/).length },
      prompt_tokens: revision.usage.promptTokens,
      completion_tokens: revision.usage.completionTokens,
      total_tokens: revision.usage.totalTokens,
      latency_ms: revision.latencyMs,
    });

    const metadataAiJob = await createAiJob({
      organization_id: contentJob.organization_id,
      job_id: job.id,
      provider: provider.name,
      model: provider.defaultModel,
      prompt_version: CONTENT_PROMPT_VERSION,
      purpose: "content_metadata",
      input_summary: { content_brief_id: brief.id },
      status: "PROCESSING",
    });
    const metadata = await provider.generateMetadata(briefData, revision.content);
    await completeAiJob(metadataAiJob.id, {
      status: "COMPLETED",
      result: { suggested_url: metadata.metadata.suggestedUrl },
      prompt_tokens: metadata.usage.promptTokens,
      completion_tokens: metadata.usage.completionTokens,
      total_tokens: metadata.usage.totalTokens,
      latency_ms: metadata.latencyMs,
    });

    const newVersion = await insertContentVersion({
      organizationId: contentJob.organization_id,
      websiteId: contentJob.website_id,
      contentBriefId: brief.id,
      contentJobId: contentJob.id,
      versionNumber: previousVersion.version_number + 1,
      title: metadata.metadata.seoTitle,
      content: revision.content.body,
      metadata: { ...metadata.metadata },
    });

    await updateContentJobStatus(contentJob.id, "QA_PENDING", { attempts: contentJob.attempts + 1 });

    const { created } = await createJob({
      organization_id: contentJob.organization_id,
      website_id: contentJob.website_id,
      job_type: "QA_CONTENT",
      payload: { content_job_id: contentJob.id },
      idempotency_key: `QA_CONTENT:${contentJob.id}`,
    });

    return { contentJobId: contentJob.id, versionId: newVersion.id, versionNumber: newVersion.version_number, qaJobCreated: created };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateContentJobStatus(contentJob.id, contentJob.status, { error: message });
    throw error;
  }
};
