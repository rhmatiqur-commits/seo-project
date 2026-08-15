import { test } from "node:test";
import assert from "node:assert/strict";
import { computeKeywordOpportunityScore, coverageGapFromPageRelevance } from "./scoring";

test("coverageGapFromPageRelevance: no existing page (0 relevance) is the maximum gap", () => {
  assert.equal(coverageGapFromPageRelevance(0), 5);
});

test("coverageGapFromPageRelevance: a near-perfect existing match minimizes the gap", () => {
  assert.equal(coverageGapFromPageRelevance(100), 0);
});

test("computeKeywordOpportunityScore: higher business/commercial relevance increases the score", () => {
  const low = computeKeywordOpportunityScore({ businessRelevance: 1, commercialValue: 1, difficulty: 3, existingPageRelevance: 0 });
  const high = computeKeywordOpportunityScore({ businessRelevance: 5, commercialValue: 5, difficulty: 3, existingPageRelevance: 0 });
  assert.ok(high > low);
});

test("computeKeywordOpportunityScore: a missing page scores higher than an already-well-covered one, all else equal", () => {
  const missingPage = computeKeywordOpportunityScore({ businessRelevance: 4, commercialValue: 4, difficulty: 2, existingPageRelevance: 0 });
  const wellCovered = computeKeywordOpportunityScore({ businessRelevance: 4, commercialValue: 4, difficulty: 2, existingPageRelevance: 100 });
  assert.ok(missingPage > wellCovered);
});

test("computeKeywordOpportunityScore: higher difficulty reduces the score", () => {
  const easy = computeKeywordOpportunityScore({ businessRelevance: 4, commercialValue: 4, difficulty: 1, existingPageRelevance: 0 });
  const hard = computeKeywordOpportunityScore({ businessRelevance: 4, commercialValue: 4, difficulty: 5, existingPageRelevance: 0 });
  assert.ok(hard < easy);
});

test("computeKeywordOpportunityScore: never returns a negative score", () => {
  const score = computeKeywordOpportunityScore({ businessRelevance: 1, commercialValue: 1, difficulty: 5, existingPageRelevance: 100 });
  assert.ok(score >= 0);
});
