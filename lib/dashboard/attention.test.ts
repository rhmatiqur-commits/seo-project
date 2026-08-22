import { test } from "node:test";
import assert from "node:assert/strict";
import { computeAttentionCounts, computeHomeAttentionState } from "./attention";

test("counts only 'new' opportunities, not approved/rejected/done ones", () => {
  const result = computeAttentionCounts({
    opportunities: [{ status: "new" }, { status: "new" }, { status: "approved" }, { status: "rejected" }, { status: "done" }],
    issues: [],
    pendingApprovalContentJobs: [],
  });
  assert.equal(result.opportunities, 2);
});

test("counts only open critical/high issues, not medium/low or closed ones", () => {
  const result = computeAttentionCounts({
    opportunities: [],
    issues: [
      { status: "open", severity: "critical" },
      { status: "open", severity: "high" },
      { status: "open", severity: "medium" },
      { status: "open", severity: "low" },
      { status: "resolved", severity: "critical" },
    ],
    pendingApprovalContentJobs: [],
  });
  assert.equal(result.audit, 2);
});

test("content count is a direct pass-through of the pending-approval job list length", () => {
  const result = computeAttentionCounts({
    opportunities: [],
    issues: [],
    pendingApprovalContentJobs: [{}, {}, {}],
  });
  assert.equal(result.content, 3);
});

test("all-zero input produces all-zero counts", () => {
  const result = computeAttentionCounts({ opportunities: [], issues: [], pendingApprovalContentJobs: [] });
  assert.deepEqual(result, { opportunities: 0, audit: 0, content: 0 });
});

test("computeHomeAttentionState: needsAttentionCount > 0 always wins, regardless of history", () => {
  assert.equal(computeHomeAttentionState({ needsAttentionCount: 3, hasAnyOpportunities: false, hasAnyIssues: false }), "needs-attention");
  assert.equal(computeHomeAttentionState({ needsAttentionCount: 1, hasAnyOpportunities: true, hasAnyIssues: true }), "needs-attention");
});

test("computeHomeAttentionState: nothing needing attention, and no opportunities or issues have ever existed -> brand-new", () => {
  assert.equal(computeHomeAttentionState({ needsAttentionCount: 0, hasAnyOpportunities: false, hasAnyIssues: false }), "brand-new");
});

test("computeHomeAttentionState: nothing needing attention, but opportunities exist (all decided) -> caught-up, not brand-new", () => {
  assert.equal(computeHomeAttentionState({ needsAttentionCount: 0, hasAnyOpportunities: true, hasAnyIssues: false }), "caught-up");
});

test("computeHomeAttentionState: nothing needing attention, but issues exist (all resolved) -> caught-up, not brand-new", () => {
  assert.equal(computeHomeAttentionState({ needsAttentionCount: 0, hasAnyOpportunities: false, hasAnyIssues: true }), "caught-up");
});

test("computeHomeAttentionState: never claims 'brand-new' once any analysis has ever run, even with zero current attention items", () => {
  assert.equal(computeHomeAttentionState({ needsAttentionCount: 0, hasAnyOpportunities: true, hasAnyIssues: true }), "caught-up");
});
