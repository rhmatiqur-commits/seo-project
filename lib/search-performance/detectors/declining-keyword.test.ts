import { test } from "node:test";
import assert from "node:assert/strict";
import { detectDecliningKeywords } from "./declining-keyword";
import type { PeriodComparison } from "@/lib/search-performance/comparison";

function cmp(overrides: Partial<PeriodComparison>): PeriodComparison {
  return {
    normalizedQuery: "cv builder uk",
    originalQuery: "CV builder UK",
    current: { normalizedQuery: "cv builder uk", originalQuery: "CV builder UK", clicks: 5, impressions: 100, ctr: 0.05, position: 12, topPageUrl: null },
    previous: { normalizedQuery: "cv builder uk", originalQuery: "CV builder UK", clicks: 10, impressions: 200, ctr: 0.05, position: 8, topPageUrl: null },
    clicksDeltaPct: -50,
    impressionsDeltaPct: -50,
    positionDelta: 4,
    isNew: false,
    ...overrides,
  };
}

test("flags a query with a significant clicks decline past a sufficient baseline", () => {
  const results = detectDecliningKeywords([cmp({})], new Map());
  assert.equal(results.length, 1);
  assert.equal(results[0]!.recommendedAction, "INVESTIGATE_DECLINE");
});

test("does not flag a new query (no previous-period baseline)", () => {
  const results = detectDecliningKeywords([cmp({ isNew: true, previous: null, clicksDeltaPct: null, impressionsDeltaPct: null, positionDelta: null })], new Map());
  assert.equal(results.length, 0);
});

test("does not flag a decline below a tiny previous-period baseline (noise, not signal)", () => {
  const tinyBaseline = cmp({
    previous: { normalizedQuery: "x", originalQuery: "x", clicks: 1, impressions: 2, ctr: 0.5, position: 8, topPageUrl: null },
  });
  const results = detectDecliningKeywords([tinyBaseline], new Map());
  assert.equal(results.length, 0);
});

test("does not flag insignificant fluctuations under every threshold", () => {
  const minor = cmp({ clicksDeltaPct: -5, impressionsDeltaPct: -5, positionDelta: 1 });
  const results = detectDecliningKeywords([minor], new Map());
  assert.equal(results.length, 0);
});

test("flags on position decline alone even when clicks/impressions are stable", () => {
  const positionOnly = cmp({ clicksDeltaPct: 0, impressionsDeltaPct: 0, positionDelta: 5 });
  const results = detectDecliningKeywords([positionOnly], new Map());
  assert.equal(results.length, 1);
});
