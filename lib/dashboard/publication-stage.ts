import type { PublicationStatus } from "@/lib/supabase/types";

/**
 * Phase 7.1A: the client-facing publication pipeline has 5 conceptual
 * stages, but the database enum (`publication_status`, 13 values) is a mix
 * of GitHub-flow states (BRANCH_CREATED/COMMITTED/PR_CREATED/PREVIEW_READY/
 * AWAITING_PRODUCTION_APPROVAL/MERGING/DEPLOYING) and WordPress-flow states
 * (DRAFTED/PUBLISHING) that both funnel toward the same PUBLISHED/FAILED/
 * UNPUBLISHED outcomes. This is a pure, deterministic *display* mapping —
 * it never changes, reads, or writes the underlying enum, which stays
 * exactly as the database defines it.
 *
 * Phase 7.1E: two labels changed from their 7.1A originals. "Branch & PR"
 * was raw GitHub jargon never translated for a client. "Approved" collided
 * with the *content*-approval badge shown just above this stepper on the
 * same page — same word, two different meanings (a content_job being
 * APPROVED vs. a content_publication being ready to go live) — renamed to
 * "Ready to publish" so the two concepts can never be confused for each
 * other again. Nothing about the underlying stage boundaries changed.
 */
export const PUBLICATION_STAGES = ["Draft", "Preparing changes", "Preview ready", "Ready to publish", "Live"] as const;

export interface PublicationStageInfo {
  /** Index into PUBLICATION_STAGES this status currently sits at. */
  stageIndex: number;
  /** True for FAILED/UNPUBLISHED — a terminal state that isn't "further
   * along", just broken or reverted. */
  failed: boolean;
}

const STAGE_BY_STATUS: Record<PublicationStatus, number> = {
  PENDING: 0,
  BRANCH_CREATED: 1,
  COMMITTED: 1,
  PR_CREATED: 1,
  PREVIEW_READY: 2,
  DRAFTED: 2,
  AWAITING_PRODUCTION_APPROVAL: 2,
  MERGING: 3,
  DEPLOYING: 4,
  PUBLISHING: 4,
  PUBLISHED: 4,
  // Terminal/abnormal states below — stageIndex is a best-effort anchor
  // point, not a claim about exactly how far publishing got before it
  // failed (that isn't recoverable from the status alone, so this
  // deliberately doesn't guess beyond what's knowable).
  FAILED: 0,
  UNPUBLISHED: 4,
};

export function getPublicationStageInfo(status: PublicationStatus): PublicationStageInfo {
  return {
    stageIndex: STAGE_BY_STATUS[status],
    failed: status === "FAILED" || status === "UNPUBLISHED",
  };
}
