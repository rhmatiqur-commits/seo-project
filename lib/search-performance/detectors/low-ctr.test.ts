import { test } from "node:test";
import assert from "node:assert/strict";
import { detectHighImpressionsLowCtr } from "./low-ctr";
import { getExpectedCtrForPosition } from "@/lib/search-performance/expected-ctr";
import type { QueryAggregate } from "@/lib/search-performance/comparison";

function agg(overrides: Partial<QueryAggregate>): QueryAggregate {
  return {
    normalizedQuery: "cv builder uk",
    originalQuery: "CV builder UK",
    clicks: 5,
    impressions: 2000,
    ctr: 0.0025,
    position: 6,
    topPageUrl: "https://example.com/cv-builder",
    ...overrides,
  };
}

test("flags a query with meaningful impressions and CTR far below the position benchmark", () => {
  const results = detectHighImpressionsLowCtr([agg({})], new Map(), new Map([["https://example.com/cv-builder", "page-1"]]));
  assert.equal(results.length, 1);
  assert.equal(results[0]!.recommendedAction, "IMPROVE_CTR");
  assert.equal(results[0]!.pageId, "page-1");
});

test("does not flag a query whose CTR meets/exceeds the benchmark", () => {
  const expected = getExpectedCtrForPosition(6);
  const results = detectHighImpressionsLowCtr([agg({ ctr: expected })], new Map(), new Map());
  assert.equal(results.length, 0);
});

test("does not flag negligible impressions even with terrible CTR", () => {
  const results = detectHighImpressionsLowCtr([agg({ impressions: 5, ctr: 0 })], new Map(), new Map());
  assert.equal(results.length, 0);
});

test("does not flag a query with no position data", () => {
  const results = detectHighImpressionsLowCtr([agg({ position: null })], new Map(), new Map());
  assert.equal(results.length, 0);
});

test("resolves keywordId via the normalized-query lookup map when present", () => {
  const [candidate] = detectHighImpressionsLowCtr([agg({})], new Map([["cv builder uk", "kw-42"]]), new Map());
  assert.equal(candidate!.keywordId, "kw-42");
});
