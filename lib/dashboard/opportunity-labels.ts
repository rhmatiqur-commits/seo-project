import type { OpportunityStatus, OpportunityType } from "@/lib/supabase/types";

/**
 * Phase 7.1D: client-safe display strings for opportunity `type` and
 * `status` enum values — never the raw SHOUTING_CASE database value. Same
 * TYPE_LABELS dict the Opportunities page already used inline since Phase 7,
 * moved here so the list page and the new detail page share one copy
 * instead of two drifting literals.
 */
const TYPE_LABELS: Record<OpportunityType, string> = {
  CREATE_NEW_PAGE: "Create a new page",
  OPTIMISE_EXISTING_PAGE: "Improve an existing page",
  TECHNICAL_FIX: "Technical fix",
  INTERNAL_LINKING: "Internal linking",
  RESEARCH_REQUIRED: "Needs research",
  IMPROVE_CTR: "Improve click-through rate",
  INVESTIGATE_DECLINE: "Investigate a decline",
  INVESTIGATE_OPPORTUNITY: "Investigate an opportunity",
  IMPROVE_INTERNAL_LINKING: "Improve internal linking",
};

export function opportunityTypeLabel(type: OpportunityType): string {
  return TYPE_LABELS[type] ?? type;
}

export function allOpportunityTypes(): OpportunityType[] {
  return Object.keys(TYPE_LABELS) as OpportunityType[];
}

/** "approved"/"rejected" read as backend verbs, not client language — the
 * client-facing decision is "Accept"/"Dismiss", so the resulting state is
 * "Accepted"/"Dismissed", not "Approved"/"Rejected". */
const STATUS_LABELS: Record<OpportunityStatus, string> = {
  new: "New opportunity",
  approved: "Accepted",
  rejected: "Dismissed",
  done: "Completed",
};

export function opportunityStatusLabel(status: OpportunityStatus): string {
  return STATUS_LABELS[status] ?? status;
}

const STATUS_TONE: Record<OpportunityStatus, string> = {
  new: "brand",
  approved: "success",
  rejected: "danger",
  done: "success",
};

export function opportunityStatusTone(status: OpportunityStatus): string {
  return STATUS_TONE[status] ?? "neutral";
}

export function allOpportunityStatuses(): OpportunityStatus[] {
  return Object.keys(STATUS_LABELS) as OpportunityStatus[];
}
