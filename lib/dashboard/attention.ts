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

/**
 * Phase 7.1F: Home previously used one sentence — "Nothing needs your
 * attention right now — nicely done" — for both "a genuinely quiet,
 * caught-up account" and "a brand-new org where nothing has been
 * generated yet." The second case hasn't done anything to be "nicely
 * done" about. This is a pure function over data Home already fetches (no
 * first-login flag, no migration): an account is "brand-new" only when
 * neither the AI opportunity pipeline nor the audit pipeline has ever
 * produced a single row for this website — the two earliest possible
 * outputs of the platform's own analysis. Once either exists, the account
 * is "live," and an empty attention list becomes the earned "caught-up"
 * case.
 */
export type HomeAttentionState = "brand-new" | "caught-up" | "needs-attention";

export interface HomeAttentionStateInput {
  needsAttentionCount: number;
  hasAnyOpportunities: boolean;
  hasAnyIssues: boolean;
}

export function computeHomeAttentionState(input: HomeAttentionStateInput): HomeAttentionState {
  if (input.needsAttentionCount > 0) return "needs-attention";
  if (!input.hasAnyOpportunities && !input.hasAnyIssues) return "brand-new";
  return "caught-up";
}
