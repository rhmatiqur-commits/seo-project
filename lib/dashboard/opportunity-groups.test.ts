import { test } from "node:test";
import assert from "node:assert/strict";
import {
  impactTier,
  groupByImpactTier,
  splitVisible,
  truncateText,
  selectOpportunitiesViewState,
  DEFAULT_VISIBLE_PER_GROUP,
} from "./opportunity-groups";

test("impactTier: >=10 high, >=5 medium, below low", () => {
  assert.equal(impactTier(15), "high");
  assert.equal(impactTier(10), "high");
  assert.equal(impactTier(9.9), "medium");
  assert.equal(impactTier(5), "medium");
  assert.equal(impactTier(4.9), "low");
  assert.equal(impactTier(0), "low");
});

test("groupByImpactTier buckets and preserves descending priority_score within each group", () => {
  const items = [
    { id: "a", priority_score: 3 },
    { id: "b", priority_score: 12 },
    { id: "c", priority_score: 7 },
    { id: "d", priority_score: 20 },
    { id: "e", priority_score: 1 },
  ];
  const groups = groupByImpactTier(items);
  assert.deepEqual(groups.high.map((o) => o.id), ["d", "b"]);
  assert.deepEqual(groups.medium.map((o) => o.id), ["c"]);
  assert.deepEqual(groups.low.map((o) => o.id), ["a", "e"]);
});

test("groupByImpactTier never drops or duplicates items", () => {
  const items = Array.from({ length: 78 }, (_, i) => ({ id: String(i), priority_score: i % 20 }));
  const groups = groupByImpactTier(items);
  const total = groups.high.length + groups.medium.length + groups.low.length;
  assert.equal(total, 78);
});

test("splitVisible caps at the default of 5 and reports the remainder", () => {
  const items = Array.from({ length: 12 }, (_, i) => i);
  const { visible, remaining } = splitVisible(items);
  assert.equal(visible.length, DEFAULT_VISIBLE_PER_GROUP);
  assert.equal(remaining, 7);
});

test("splitVisible with a count >= length shows everything with no remainder", () => {
  const items = [1, 2, 3];
  const { visible, remaining } = splitVisible(items, 10);
  assert.deepEqual(visible, [1, 2, 3]);
  assert.equal(remaining, 0);
});

test("truncateText leaves short text untouched", () => {
  assert.equal(truncateText("Short rationale."), "Short rationale.");
});

test("truncateText cuts long text at a word boundary with an ellipsis", () => {
  const long = "This opportunity exists because organic search impressions for this page have declined significantly over the last quarter and competitors now rank above it.";
  const result = truncateText(long, 60);
  assert.ok(result.length <= 61, "should not exceed maxLength by more than the ellipsis");
  assert.ok(result.endsWith("…"));
  assert.ok(!result.includes("  "));
});

test("selectOpportunitiesViewState: no-data when the list is empty", () => {
  assert.equal(selectOpportunitiesViewState([]), "no-data");
});

test("selectOpportunitiesViewState: has-new whenever at least one 'new' opportunity exists", () => {
  assert.equal(selectOpportunitiesViewState([{ status: "new" }, { status: "approved" }]), "has-new");
});

test("selectOpportunitiesViewState: only-dismissed when every opportunity is rejected", () => {
  assert.equal(selectOpportunitiesViewState([{ status: "rejected" }, { status: "rejected" }]), "only-dismissed");
});

test("selectOpportunitiesViewState: only-accepted when every opportunity is approved", () => {
  assert.equal(selectOpportunitiesViewState([{ status: "approved" }, { status: "approved" }]), "only-accepted");
});

test("selectOpportunitiesViewState: all-caught-up for a mixed decided set (e.g. approved + done + rejected)", () => {
  assert.equal(selectOpportunitiesViewState([{ status: "approved" }, { status: "rejected" }, { status: "done" }]), "all-caught-up");
});
