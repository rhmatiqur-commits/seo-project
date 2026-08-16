import type { ContentPipelineStatus } from "@/lib/supabase/types";

/**
 * The full legal transition graph for content_jobs.status. Both the async
 * job handlers (generate/qa/revise-content.ts) and the human admin actions
 * (approve/reject/revise) go through canTransitionContentJob before
 * mutating status — a single source of truth for what's allowed, pure and
 * unit-tested, same convention as lib/jobs/policy.ts's job_status rules.
 *
 * APPROVED and REJECTED are terminal: nothing transitions out of them. A
 * human who wants another attempt after REJECTED creates a fresh
 * content_jobs row for the same brief instead (see
 * lib/db/content.ts's findActiveContentJobForBrief — a brief with only
 * terminal content_jobs rows is treated as available for a new attempt).
 */
const TRANSITIONS: Record<ContentPipelineStatus, ContentPipelineStatus[]> = {
  DRAFT: ["QA_PENDING"],
  QA_PENDING: ["READY_FOR_APPROVAL", "QA_FAILED", "NEEDS_REVIEW"],
  QA_FAILED: ["QA_PENDING", "REJECTED"],
  NEEDS_REVIEW: ["QA_PENDING", "APPROVED", "REJECTED"],
  READY_FOR_APPROVAL: ["APPROVED", "REJECTED", "QA_PENDING"],
  APPROVED: [],
  REJECTED: [],
};

export function canTransitionContentJob(from: ContentPipelineStatus, to: ContentPipelineStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function isTerminalContentStatus(status: ContentPipelineStatus): boolean {
  return TRANSITIONS[status].length === 0;
}

/** Which human actions the admin UI should offer for a given status — a
 * single source of truth for button visibility, mirroring how disabled
 * buttons are computed elsewhere in app/admin/*. */
export interface AvailableContentActions {
  canApprove: boolean;
  canReject: boolean;
  canRevise: boolean;
}

// Statuses where a version already exists and a human manually requesting
// another pass makes sense. Deliberately not derived from
// canTransitionContentJob(status, "QA_PENDING") — DRAFT also legally
// transitions to QA_PENDING, but that's the automatic post-generation
// transition (no version to revise yet), not a human "Revise" action.
const MANUAL_REVISE_STATUSES: ReadonlySet<ContentPipelineStatus> = new Set(["QA_FAILED", "NEEDS_REVIEW", "READY_FOR_APPROVAL"]);

export function availableContentActions(status: ContentPipelineStatus): AvailableContentActions {
  return {
    canApprove: canTransitionContentJob(status, "APPROVED"),
    canReject: canTransitionContentJob(status, "REJECTED"),
    canRevise: MANUAL_REVISE_STATUSES.has(status),
  };
}
