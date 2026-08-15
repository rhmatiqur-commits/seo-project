import { test } from "node:test";
import assert from "node:assert/strict";
import { getSerpPriorityTier, getSerpRefetchDays, isKeywordDueForSerpFetch } from "./priority-tier";

test("getSerpPriorityTier: high keyword_opportunities score -> HIGH", () => {
  assert.equal(getSerpPriorityTier({ keywordOpportunityScore: 9, hasPageTwoOpportunity: false, recentImpressions: 0 }), "HIGH");
});

test("getSerpPriorityTier: an existing page-two opportunity -> HIGH regardless of score", () => {
  assert.equal(getSerpPriorityTier({ keywordOpportunityScore: 0, hasPageTwoOpportunity: true, recentImpressions: 0 }), "HIGH");
});

test("getSerpPriorityTier: meaningful GSC impressions alone -> HIGH", () => {
  assert.equal(getSerpPriorityTier({ keywordOpportunityScore: null, hasPageTwoOpportunity: false, recentImpressions: 1000 }), "HIGH");
});

test("getSerpPriorityTier: moderate score -> MEDIUM", () => {
  assert.equal(getSerpPriorityTier({ keywordOpportunityScore: 5, hasPageTwoOpportunity: false, recentImpressions: 0 }), "MEDIUM");
});

test("getSerpPriorityTier: no signals at all -> LOW", () => {
  assert.equal(getSerpPriorityTier({ keywordOpportunityScore: null, hasPageTwoOpportunity: false, recentImpressions: 0 }), "LOW");
});

test("getSerpRefetchDays: HIGH < MEDIUM < LOW", () => {
  assert.ok(getSerpRefetchDays("HIGH") < getSerpRefetchDays("MEDIUM"));
  assert.ok(getSerpRefetchDays("MEDIUM") < getSerpRefetchDays("LOW"));
});

test("isKeywordDueForSerpFetch: never fetched -> always due", () => {
  assert.equal(isKeywordDueForSerpFetch("LOW", null, new Date()), true);
});

test("isKeywordDueForSerpFetch: fetched recently, within tier window -> not due", () => {
  const now = new Date("2026-08-15T00:00:00Z");
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  assert.equal(isKeywordDueForSerpFetch("HIGH", yesterday, now), false);
});

test("isKeywordDueForSerpFetch: fetched past the tier window -> due", () => {
  const now = new Date("2026-08-15T00:00:00Z");
  const longAgo = new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000).toISOString();
  assert.equal(isKeywordDueForSerpFetch("HIGH", longAgo, now), true);
  // Same elapsed time is NOT yet due for LOW tier (30-day window not exceeded until 30 days, 40 > 30 so still due)
  assert.equal(isKeywordDueForSerpFetch("LOW", longAgo, now), true);
});

test("isKeywordDueForSerpFetch: HIGH tier due sooner than LOW tier for the same last-fetch time", () => {
  const now = new Date("2026-08-15T00:00:00Z");
  const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString();
  assert.equal(isKeywordDueForSerpFetch("HIGH", tenDaysAgo, now), true); // 10 days > 7-day HIGH window
  assert.equal(isKeywordDueForSerpFetch("LOW", tenDaysAgo, now), false); // 10 days < 30-day LOW window
});
