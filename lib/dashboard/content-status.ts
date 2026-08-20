import type { ContentPipelineStatus } from "@/lib/supabase/types";
import { MAX_CONTENT_REVISIONS } from "@/lib/content/limits";

/**
 * Phase 7.1E: presentation-only helpers over content_jobs' existing
 * `status`/`attempts` columns — no new data, no scoring, no schema change.
 * MAX_CONTENT_REVISIONS (2) is the real automatic-retry limit
 * lib/jobs/handlers/qa-content.ts already enforces; this only describes it
 * to the client instead of leaving a QA_FAILED badge that looks identical
 * whether a retry is already in flight or the pipeline is genuinely stuck.
 */

/** Total attempts a brief can go through automatically: the first
 * generation, plus up to MAX_CONTENT_REVISIONS automatic revisions. */
export const CONTENT_GENERATION_MAX_ATTEMPTS = MAX_CONTENT_REVISIONS + 1;

/** `attempts` counts completed revisions (0 = still on the first draft), so
 * the client-facing "current attempt" is always one more than that. */
export function attemptContextLabel(attempts: number): string {
  const current = Math.min(attempts + 1, CONTENT_GENERATION_MAX_ATTEMPTS);
  return `Attempt ${current} of ${CONTENT_GENERATION_MAX_ATTEMPTS}`;
}

/** True exactly when qa-content.ts's own "attempts < MAX_CONTENT_REVISIONS"
 * check means an automatic REVISE_CONTENT has already been chained — i.e.
 * QA_FAILED here does not mean "waiting on a human," it means "the platform
 * is already retrying." NEEDS_REVIEW (attempts exhausted) is the state that
 * actually needs a person. */
export function isAutomaticRetryInProgress(status: ContentPipelineStatus, attempts: number): boolean {
  return status === "QA_FAILED" && attempts < MAX_CONTENT_REVISIONS;
}

export type ContentAttentionBucket = "needs-you" | "in-progress" | "done";

/** Which of the three Content-list groups a brief belongs in, based on its
 * latest content_jobs row (null when no job has been created yet). Mirrors
 * the same "what needs a human vs. what's just moving" split
 * lib/dashboard/opportunity-groups.ts's view state applies to Opportunities. */
export function contentAttentionBucket(status: ContentPipelineStatus | null): ContentAttentionBucket {
  if (status === "READY_FOR_APPROVAL" || status === "NEEDS_REVIEW") return "needs-you";
  if (status === "APPROVED" || status === "REJECTED") return "done";
  return "in-progress";
}
