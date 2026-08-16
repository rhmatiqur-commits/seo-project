import { createJob } from "@/lib/db/jobs";
import { getContentJob, getContentBrief, getLatestContentVersionForBrief, updateContentJobStatus, updateContentVersionQaStatus, insertContentQaResult } from "@/lib/db/content";
import { listPagesForWebsite } from "@/lib/db/pages";
import { runDeterministicChecks } from "@/lib/content/qa/deterministic";
import { runContentAiQa } from "@/lib/content/qa/ai-qa";
import { computeQaResult } from "@/lib/content/qa/compute-result";
import { canTransitionContentJob } from "@/lib/content/state-machine";
import { MAX_CONTENT_REVISIONS } from "@/lib/content/limits";
import type { ContentBrief } from "@/lib/content/brief-types";
import type { ContentMetadata } from "@/lib/content/provider";
import type { JobHandler } from "@/lib/jobs/types";

/**
 * QA_CONTENT: runs deterministic checks + an AI-assisted rating pass
 * against the latest content_versions row, stores the combined result, and
 * moves the content_job forward: READY_FOR_APPROVAL on pass; otherwise
 * QA_FAILED (+ a chained REVISE_CONTENT) while attempts remain under
 * MAX_CONTENT_REVISIONS, or NEEDS_REVIEW once they're exhausted — never an
 * automatic loop past that limit (see lib/content/limits.ts).
 */
export const handleQaContent: JobHandler = async ({ job }) => {
  const payload = job.payload as { content_job_id?: string } | null;
  const contentJobId = payload?.content_job_id;
  if (!contentJobId) throw new Error("QA_CONTENT job is missing payload.content_job_id");

  const contentJob = await getContentJob(contentJobId);
  if (!contentJob) throw new Error(`content_job ${contentJobId} not found`);

  const brief = await getContentBrief(contentJob.content_brief_id);
  if (!brief) throw new Error(`content_brief ${contentJob.content_brief_id} not found`);

  const version = await getLatestContentVersionForBrief(brief.id);
  if (!version) throw new Error(`No content_versions row exists yet for content_brief ${brief.id}`);

  try {
    const briefData = brief.brief_data as unknown as ContentBrief;
    const metadata = version.metadata as unknown as ContentMetadata;
    const pages = await listPagesForWebsite(contentJob.website_id);
    const knownPageUrls = [...pages.map((p) => p.url), ...(briefData.targetUrl ? [briefData.targetUrl] : [])];

    const deterministicChecks = runDeterministicChecks({ body: version.content, metadata, brief: briefData, knownPageUrls });
    const aiQa = await runContentAiQa(contentJob.organization_id, job.id, briefData, { body: version.content });
    const result = computeQaResult(deterministicChecks, aiQa.ai);

    await insertContentQaResult({
      organizationId: contentJob.organization_id,
      websiteId: contentJob.website_id,
      contentVersionId: version.id,
      aiJobId: aiQa.aiJobId,
      passed: result.passed,
      score: result.score,
      deterministicChecks: deterministicChecks as unknown as Record<string, unknown>[],
      aiFeedback: aiQa.ai as unknown as Record<string, unknown> | null,
      issues: result.issues as unknown as Record<string, unknown>[],
      model: aiQa.model,
      promptVersion: aiQa.promptVersion,
    });
    await updateContentVersionQaStatus(version.id, result.passed ? "PASSED" : "FAILED");

    if (result.passed) {
      if (!canTransitionContentJob(contentJob.status, "READY_FOR_APPROVAL")) {
        throw new Error(`content_job ${contentJob.id} cannot move from ${contentJob.status} to READY_FOR_APPROVAL`);
      }
      await updateContentJobStatus(contentJob.id, "READY_FOR_APPROVAL", { completedAt: new Date().toISOString() });
      return { contentJobId: contentJob.id, versionId: version.id, passed: true, score: result.score };
    }

    if (contentJob.attempts < MAX_CONTENT_REVISIONS) {
      if (!canTransitionContentJob(contentJob.status, "QA_FAILED")) {
        throw new Error(`content_job ${contentJob.id} cannot move from ${contentJob.status} to QA_FAILED`);
      }
      await updateContentJobStatus(contentJob.id, "QA_FAILED");
      const { created } = await createJob({
        organization_id: contentJob.organization_id,
        website_id: contentJob.website_id,
        job_type: "REVISE_CONTENT",
        payload: { content_job_id: contentJob.id },
        idempotency_key: `REVISE_CONTENT:${contentJob.id}`,
      });
      return { contentJobId: contentJob.id, versionId: version.id, passed: false, score: result.score, revisionJobCreated: created };
    }

    if (!canTransitionContentJob(contentJob.status, "NEEDS_REVIEW")) {
      throw new Error(`content_job ${contentJob.id} cannot move from ${contentJob.status} to NEEDS_REVIEW`);
    }
    await updateContentJobStatus(contentJob.id, "NEEDS_REVIEW", { completedAt: new Date().toISOString() });
    return { contentJobId: contentJob.id, versionId: version.id, passed: false, score: result.score, revisionsExhausted: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateContentJobStatus(contentJob.id, contentJob.status, { error: message });
    throw error;
  }
};
