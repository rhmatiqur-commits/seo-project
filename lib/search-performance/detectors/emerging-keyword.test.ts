import { test } from "node:test";
import assert from "node:assert/strict";
import { detectEmergingKeywords } from "./emerging-keyword";
import type { PeriodComparison } from "@/lib/search-performance/comparison";

test("flags a genuinely new query with meaningful current impressions", () => {
  const cmp: PeriodComparison = {
    normalizedQuery: "new query",
    originalQuery: "new query",
    current: { normalizedQuery: "new query", originalQuery: "new query", clicks: 3, impressions: 80, ctr: 0.04, position: 9, topPageUrl: null },
    previous: null,
    clicksDeltaPct: null,
    impressionsDeltaPct: null,
    positionDelta: null,
    isNew: true,
  };
  const results = detectEmergingKeywords([cmp], new Map());
  assert.equal(results.length, 1);
  assert.equal(results[0]!.recommendedAction, "INVESTIGATE_OPPORTUNITY");
});

test("does not flag a brand new query with negligible impressions", () => {
  const cmp: PeriodComparison = {
    normalizedQuery: "tiny new query",
    originalQuery: "tiny new query",
    current: { normalizedQuery: "tiny new query", originalQuery: "tiny new query", clicks: 0, impressions: 2, ctr: 0, position: 40, topPageUrl: null },
    previous: null,
    clicksDeltaPct: null,
    impressionsDeltaPct: null,
    positionDelta: null,
    isNew: true,
  };
  assert.equal(detectEmergingKeywords([cmp], new Map()).length, 0);
});

test("flags substantial impression growth on an existing query", () => {
  const cmp: PeriodComparison = {
    normalizedQuery: "growing query",
    originalQuery: "growing query",
    current: { normalizedQuery: "growing query", originalQuery: "growing query", clicks: 10, impressions: 300, ctr: 0.03, position: 6, topPageUrl: null },
    previous: { normalizedQuery: "growing query", originalQuery: "growing query", clicks: 5, impressions: 150, ctr: 0.03, position: 8, topPageUrl: null },
    clicksDeltaPct: 100,
    impressionsDeltaPct: 100,
    positionDelta: -2,
    isNew: false,
  };
  const results = detectEmergingKeywords([cmp], new Map());
  assert.equal(results.length, 1);
});

test("does not flag modest, insignificant growth", () => {
  const cmp: PeriodComparison = {
    normalizedQuery: "stable query",
    originalQuery: "stable query",
    current: { normalizedQuery: "stable query", originalQuery: "stable query", clicks: 10, impressions: 210, ctr: 0.048, position: 6, topPageUrl: null },
    previous: { normalizedQuery: "stable query", originalQuery: "stable query", clicks: 10, impressions: 200, ctr: 0.05, position: 6, topPageUrl: null },
    clicksDeltaPct: 0,
    impressionsDeltaPct: 5,
    positionDelta: 0,
    isNew: false,
  };
  assert.equal(detectEmergingKeywords([cmp], new Map()).length, 0);
});
