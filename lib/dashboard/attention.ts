/**
 * Phase 7.1B: the sidebar/drawer show a quiet attention count next to
 * Opportunities/Audit/Content only when there's genuinely something to
 * act on — never a raw row count of everything that exists. This is a
 * pure function over data the layout already fetches from existing
 * lib/db services (no new metric, no new query logic): the exact same
 * "new" opportunity filter Opportunities' page uses, the same
 * critical/high open-issue filter Home/Audit already use, and the same
 * READY_FOR_APPROVAL content-job list Home already fetches.
 */
export interface AttentionCountsInput {
  opportunities: { status: string }[];
  issues: { status: string; severity: string }[];
  pendingApprovalContentJobs: unknown[];
}

export interface AttentionCounts {
  opportunities: number;
  audit: number;
  content: number;
}

export function computeAttentionCounts(input: AttentionCountsInput): AttentionCounts {
  return {
    opportunities: input.opportunities.filter((o) => o.status === "new").length,
    audit: input.issues.filter((i) => i.status === "open" && (i.severity === "critical" || i.severity === "high")).length,
    content: input.pendingApprovalContentJobs.length,
  };
}
