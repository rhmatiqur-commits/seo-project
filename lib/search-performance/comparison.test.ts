import { test } from "node:test";
import assert from "node:assert/strict";
import { aggregateByQuery, comparePeriods } from "./comparison";

test("aggregateByQuery sums clicks/impressions and recomputes CTR from totals", () => {
  const rows = [
    { date: "2026-08-01", query: "landlord accountant Coventry", page_url: "/a", clicks: 10, impressions: 200, position: 12 },
    { date: "2026-08-02", query: "Landlord Accountant  Coventry", page_url: "/a", clicks: 5, impressions: 100, position: 14 },
  ];
  const result = aggregateByQuery(rows);
  const agg = result.get("landlord accountant coventry");
  assert.ok(agg);
  assert.equal(agg!.clicks, 15);
  assert.equal(agg!.impressions, 300);
  assert.equal(agg!.ctr, 0.05); // 15/300
});

test("aggregateByQuery computes an impressions-weighted average position", () => {
  const rows = [
    { date: "2026-08-01", query: "cv builder", page_url: "/cv", clicks: 1, impressions: 100, position: 10 },
    { date: "2026-08-02", query: "cv builder", page_url: "/cv", clicks: 1, impressions: 300, position: 20 },
  ];
  const agg = aggregateByQuery(rows).get("cv builder")!;
  // (10*100 + 20*300) / 400 = 17.5
  assert.equal(agg.position, 17.5);
});

test("aggregateByQuery drops rows with no query", () => {
  const rows = [{ date: "2026-08-01", query: null, page_url: "/a", clicks: 5, impressions: 50, position: 3 }];
  assert.equal(aggregateByQuery(rows).size, 0);
});

test("aggregateByQuery tracks the page with the most clicks per query", () => {
  const rows = [
    { date: "2026-08-01", query: "cv builder", page_url: "/a", clicks: 2, impressions: 50, position: 5 },
    { date: "2026-08-01", query: "cv builder", page_url: "/b", clicks: 8, impressions: 50, position: 5 },
  ];
  assert.equal(aggregateByQuery(rows).get("cv builder")!.topPageUrl, "/b");
});

test("comparePeriods computes percentage deltas for clicks/impressions", () => {
  const current = [{ date: "2026-08-08", query: "cv builder", page_url: "/a", clicks: 20, impressions: 400, position: 8 }];
  const previous = [{ date: "2026-08-01", query: "cv builder", page_url: "/a", clicks: 10, impressions: 200, position: 8 }];
  const [cmp] = comparePeriods(current, previous);
  assert.equal(cmp!.clicksDeltaPct, 100);
  assert.equal(cmp!.impressionsDeltaPct, 100);
  assert.equal(cmp!.isNew, false);
});

test("comparePeriods flags positionDelta positive when position worsens (higher number = lower rank)", () => {
  const current = [{ date: "2026-08-08", query: "cv builder", page_url: "/a", clicks: 1, impressions: 100, position: 15 }];
  const previous = [{ date: "2026-08-01", query: "cv builder", page_url: "/a", clicks: 1, impressions: 100, position: 8 }];
  const [cmp] = comparePeriods(current, previous);
  assert.equal(cmp!.positionDelta, 7);
});

test("comparePeriods marks a query with no previous-period data as new, with null deltas", () => {
  const current = [{ date: "2026-08-08", query: "brand new query", page_url: "/a", clicks: 5, impressions: 100, position: 10 }];
  const [cmp] = comparePeriods(current, []);
  assert.equal(cmp!.isNew, true);
  assert.equal(cmp!.previous, null);
  assert.equal(cmp!.clicksDeltaPct, null);
  assert.equal(cmp!.impressionsDeltaPct, null);
});

test("comparePeriods returns null percent delta rather than dividing by zero when previous was zero", () => {
  const current = [{ date: "2026-08-08", query: "q", page_url: "/a", clicks: 5, impressions: 0, position: null }];
  const previous = [{ date: "2026-08-01", query: "q", page_url: "/a", clicks: 0, impressions: 0, position: null }];
  const [cmp] = comparePeriods(current, previous);
  assert.equal(cmp!.clicksDeltaPct, null);
});
