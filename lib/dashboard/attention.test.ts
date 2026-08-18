import { test } from "node:test";
import assert from "node:assert/strict";
import { computeAttentionCounts, buildAttentionItems } from "./attention";

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

// ---------------------------------------------------------------------------
// buildAttentionItems (Phase 7.1C)
// ---------------------------------------------------------------------------

const emptyInput = { orgSlug: "acme", opportunities: [], issues: [], pendingApprovalContentJobs: [], publications: [], alerts: [] };

test("buildAttentionItems: fully empty input produces an empty list", () => {
  assert.deepEqual(buildAttentionItems(emptyInput), []);
});

test("buildAttentionItems: zero-count categories are omitted entirely, not shown as 0", () => {
  const items = buildAttentionItems({ ...emptyInput, opportunities: [{ status: "approved" }, { status: "rejected" }] });
  assert.deepEqual(items, []);
});

test("buildAttentionItems: counts only 'new' opportunities and labels them in client language", () => {
  const items = buildAttentionItems({ ...emptyInput, opportunities: [{ status: "new" }, { status: "new" }, { status: "approved" }] });
  assert.equal(items.length, 1);
  assert.equal(items[0]!.key, "opportunities");
  assert.equal(items[0]!.count, 2);
  assert.equal(items[0]!.label, "2 SEO opportunities to review");
  assert.equal(items[0]!.href, "/dashboard/acme/opportunities");
});

test("buildAttentionItems: singular label for exactly 1 opportunity", () => {
  const items = buildAttentionItems({ ...emptyInput, opportunities: [{ status: "new" }] });
  assert.equal(items[0]!.label, "1 SEO opportunity to review");
});

test("buildAttentionItems: issues already assumed status='open' — counts only critical/high severity", () => {
  const items = buildAttentionItems({
    ...emptyInput,
    issues: [{ severity: "critical" }, { severity: "high" }, { severity: "medium" }, { severity: "low" }],
  });
  assert.equal(items.length, 1);
  assert.equal(items[0]!.key, "audit");
  assert.equal(items[0]!.count, 2);
  assert.equal(items[0]!.label, "2 issues need attention");
  assert.equal(items[0]!.tone, "danger");
});

test("buildAttentionItems: content awaiting approval is a direct pass-through count", () => {
  const items = buildAttentionItems({ ...emptyInput, pendingApprovalContentJobs: [{}, {}] });
  assert.equal(items.length, 1);
  assert.equal(items[0]!.key, "content");
  assert.equal(items[0]!.label, "2 articles ready for review");
});

test("buildAttentionItems: publications are filtered to AWAITING_PRODUCTION_APPROVAL only", () => {
  const items = buildAttentionItems({
    ...emptyInput,
    publications: [{ status: "AWAITING_PRODUCTION_APPROVAL" }, { status: "PUBLISHED" }, { status: "PENDING" }, { status: "AWAITING_PRODUCTION_APPROVAL" }],
  });
  assert.equal(items.length, 1);
  assert.equal(items[0]!.key, "publishing");
  assert.equal(items[0]!.count, 2);
  assert.equal(items[0]!.label, "2 pages ready to go live");
});

test("buildAttentionItems: each open alert becomes its own item, using the alert's own message verbatim", () => {
  const items = buildAttentionItems({ ...emptyInput, alerts: [{ id: "a1", message: "Traffic dropped on /blog/foo" }] });
  assert.equal(items.length, 1);
  assert.equal(items[0]!.label, "Traffic dropped on /blog/foo");
  assert.equal(items[0]!.key, "alert-a1");
});

test("buildAttentionItems: does not expose alert ids in the label, only as part of the internal key", () => {
  const items = buildAttentionItems({ ...emptyInput, alerts: [{ id: "secret-internal-id-123", message: "Position declined" }] });
  assert.doesNotMatch(items[0]!.label, /secret-internal-id-123/);
});

test("buildAttentionItems: publishing (ready to go live) is ordered ahead of opportunities", () => {
  const items = buildAttentionItems({
    ...emptyInput,
    opportunities: [{ status: "new" }],
    publications: [{ status: "AWAITING_PRODUCTION_APPROVAL" }],
  });
  assert.equal(items[0]!.key, "publishing");
  assert.equal(items[items.length - 1]!.key, "opportunities");
});

test("buildAttentionItems: a fully populated input returns one item per non-zero category plus one per alert", () => {
  const items = buildAttentionItems({
    orgSlug: "acme",
    opportunities: [{ status: "new" }],
    issues: [{ severity: "critical" }],
    pendingApprovalContentJobs: [{}],
    publications: [{ status: "AWAITING_PRODUCTION_APPROVAL" }],
    alerts: [{ id: "a1", message: "x" }, { id: "a2", message: "y" }],
  });
  assert.equal(items.length, 6);
});
