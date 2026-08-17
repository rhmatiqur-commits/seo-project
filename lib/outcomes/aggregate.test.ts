import { test } from "node:test";
import assert from "node:assert/strict";
import { aggregateWindowMetrics } from "./aggregate";

test("aggregateWindowMetrics sums clicks/impressions across rows", () => {
  const result = aggregateWindowMetrics([
    { clicks: 5, impressions: 100, position: 10 },
    { clicks: 3, impressions: 50, position: 12 },
  ]);
  assert.equal(result.clicks, 8);
  assert.equal(result.impressions, 150);
});

test("aggregateWindowMetrics recomputes ctr from totals, never averages stored per-row ctr", () => {
  const result = aggregateWindowMetrics([
    { clicks: 10, impressions: 100, position: null },
    { clicks: 0, impressions: 100, position: null },
  ]);
  assert.equal(result.ctr, 0.05);
});

test("aggregateWindowMetrics returns ctr 0 when there are no impressions", () => {
  const result = aggregateWindowMetrics([]);
  assert.equal(result.ctr, 0);
  assert.equal(result.clicks, 0);
  assert.equal(result.impressions, 0);
});

test("aggregateWindowMetrics computes an impressions-weighted average position", () => {
  const result = aggregateWindowMetrics([
    { clicks: 0, impressions: 90, position: 10 },
    { clicks: 0, impressions: 10, position: 20 },
  ]);
  // (10*90 + 20*10) / 100 = 11
  assert.equal(result.position, 11);
});

test("aggregateWindowMetrics ignores rows with a null position when averaging", () => {
  const result = aggregateWindowMetrics([
    { clicks: 0, impressions: 50, position: 10 },
    { clicks: 0, impressions: 50, position: null },
  ]);
  assert.equal(result.position, 10);
});

test("aggregateWindowMetrics returns null position when no row has one", () => {
  const result = aggregateWindowMetrics([{ clicks: 1, impressions: 10, position: null }]);
  assert.equal(result.position, null);
});
