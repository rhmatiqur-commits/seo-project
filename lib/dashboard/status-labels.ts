import type { ContentPipelineStatus, PublicationStatus } from "@/lib/supabase/types";

/**
 * Phase 7.1B client-language pass: several pages rendered raw enum values
 * (`job.status.replace(/_/g, " ")` -> "READY FOR APPROVAL", "QA PENDING";
 * `publication.status.replace(/_/g, " ")` -> "BRANCH CREATED", "AWAITING
 * PRODUCTION APPROVAL") directly as user-facing text. These two pure maps
 * translate the *same* underlying enum values (never altered, never
 * reinterpreted — see lib/content/state-machine.ts and
 * lib/dashboard/publication-stage.ts for the actual state logic) into the
 * plain-English labels a client sees instead.
 */
const CONTENT_STATUS_LABELS: Record<ContentPipelineStatus, string> = {
  DRAFT: "Draft",
  QA_PENDING: "Checking quality",
  QA_FAILED: "Needs changes",
  NEEDS_REVIEW: "Needs review",
  READY_FOR_APPROVAL: "Ready for your approval",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

export function contentStatusLabel(status: ContentPipelineStatus): string {
  return CONTENT_STATUS_LABELS[status] ?? status.replace(/_/g, " ");
}

const PUBLICATION_STATUS_LABELS: Record<PublicationStatus, string> = {
  PENDING: "Getting ready",
  PUBLISHING: "Publishing",
  BRANCH_CREATED: "Preparing changes",
  COMMITTED: "Preparing changes",
  PR_CREATED: "Ready for review",
  PREVIEW_READY: "Preview ready",
  AWAITING_PRODUCTION_APPROVAL: "Awaiting your approval",
  MERGING: "Publishing",
  DEPLOYING: "Publishing",
  DRAFTED: "Draft saved",
  PUBLISHED: "Live",
  FAILED: "Failed",
  UNPUBLISHED: "Taken down",
};

export function publicationStatusLabel(status: PublicationStatus): string {
  return PUBLICATION_STATUS_LABELS[status] ?? status.replace(/_/g, " ");
}
