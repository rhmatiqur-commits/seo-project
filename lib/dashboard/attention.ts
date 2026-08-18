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

// ---------------------------------------------------------------------------
// Phase 7.1C: the Home page's "Needs your attention" section needs more than
// a bare count per category — a client-language label, a short description,
// a link, and a colour that reflects what kind of attention it is (a
// pending decision vs. an actual problem). This is a separate function from
// computeAttentionCounts above (still used unchanged by the sidebar's nav
// badges) because the two have genuinely different shapes, not because the
// underlying "what counts" rules differ — where they overlap (new
// opportunities, critical/high issues, pending-approval content) the exact
// same filters are used.
// ---------------------------------------------------------------------------

export type AttentionTone = "danger" | "warning" | "info";

export interface AttentionItem {
  key: string;
  label: string;
  description?: string;
  count?: number;
  tone: AttentionTone;
  href?: string;
}

export interface AttentionItemsInput {
  orgSlug: string;
  opportunities: { status: string }[];
  /** Already status='open'-filtered by lib/db/audits.ts's listIssuesForWebsite. */
  issues: { severity: string }[];
  pendingApprovalContentJobs: unknown[];
  /** The website's publications, any status/limit — filtered here for
   * AWAITING_PRODUCTION_APPROVAL, not fetched with that filter already
   * applied, since the same list is reused for the Recent Activity section. */
  publications: { status: string }[];
  alerts: { id: string; message: string }[];
}

/**
 * Ordered by how immediately actionable each category is — a page one
 * click from going live outranks a large pile of unreviewed opportunities.
 * Zero-count categories are omitted entirely (spec: "Do not show an item if
 * its count is zero"); alerts are included individually since each one is
 * already a specific, non-aggregable message.
 */
export function buildAttentionItems(input: AttentionItemsInput): AttentionItem[] {
  const items: AttentionItem[] = [];

  const awaitingProductionApproval = input.publications.filter((p) => p.status === "AWAITING_PRODUCTION_APPROVAL").length;
  if (awaitingProductionApproval > 0) {
    items.push({
      key: "publishing",
      label: `${awaitingProductionApproval} page${awaitingProductionApproval === 1 ? "" : "s"} ready to go live`,
      description: "Approved content prepared and waiting for your final publish approval.",
      count: awaitingProductionApproval,
      tone: "warning",
      href: `/dashboard/${input.orgSlug}/publishing`,
    });
  }

  const readyForReview = input.pendingApprovalContentJobs.length;
  if (readyForReview > 0) {
    items.push({
      key: "content",
      label: `${readyForReview} article${readyForReview === 1 ? "" : "s"} ready for review`,
      description: "Content drafts ready for your approval.",
      count: readyForReview,
      tone: "warning",
      href: `/dashboard/${input.orgSlug}/content`,
    });
  }

  const criticalOrHighIssues = input.issues.filter((i) => i.severity === "critical" || i.severity === "high").length;
  if (criticalOrHighIssues > 0) {
    items.push({
      key: "audit",
      label: `${criticalOrHighIssues} issue${criticalOrHighIssues === 1 ? "" : "s"} need attention`,
      description: "Critical or high-severity issues found in your last audit.",
      count: criticalOrHighIssues,
      tone: "danger",
      href: `/dashboard/${input.orgSlug}/audit`,
    });
  }

  for (const alert of input.alerts) {
    items.push({ key: `alert-${alert.id}`, label: alert.message, tone: "warning", href: `/dashboard/${input.orgSlug}/outcomes` });
  }

  const newOpportunities = input.opportunities.filter((o) => o.status === "new").length;
  if (newOpportunities > 0) {
    items.push({
      key: "opportunities",
      label: `${newOpportunities} SEO opportunit${newOpportunities === 1 ? "y" : "ies"} to review`,
      description: "New recommendations for growing your organic search performance.",
      count: newOpportunities,
      tone: "info",
      href: `/dashboard/${input.orgSlug}/opportunities`,
    });
  }

  return items;
}
