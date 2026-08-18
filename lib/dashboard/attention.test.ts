import { test } from "node:test";
import assert from "node:assert/strict";
import { computeAttentionCounts } from "./attention";

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
