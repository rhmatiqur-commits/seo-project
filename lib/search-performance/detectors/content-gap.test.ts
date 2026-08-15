import { test } from "node:test";
import assert from "node:assert/strict";
import { detectContentGaps, type KeywordOpportunityForContentGap } from "./content-gap";

function row(overrides: Partial<KeywordOpportunityForContentGap>): KeywordOpportunityForContentGap {
  return {
    id: "ko-1",
    keywordId: "kw-1",
    keyword: "landlord accountant Coventry",
    opportunityType: "CREATE_NEW_PAGE",
    currentPageId: null,
    businessRelevanceScore: 4,
    commercialValueScore: 4,
    seoOpportunityId: null,
    ...overrides,
  };
}

test("surfaces a CREATE_NEW_PAGE gap with no current page and not yet promoted", () => {
  const results = detectContentGaps([row({})]);
  assert.equal(results.length, 1);
  assert.equal(results[0]!.recommendedAction, "CREATE_NEW_PAGE");
});

test("skips rows that already have a current page", () => {
  const results = detectContentGaps([row({ currentPageId: "page-1" })]);
  assert.equal(results.length, 0);
});

test("skips rows already promoted (duplicate-opportunity/task prevention)", () => {
  const results = detectContentGaps([row({ seoOpportunityId: "seo-opp-1" })]);
  assert.equal(results.length, 0);
});

test("skips rows whose recommended action isn't CREATE_NEW_PAGE", () => {
  const results = detectContentGaps([row({ opportunityType: "OPTIMISE_EXISTING_PAGE" })]);
  assert.equal(results.length, 0);
});
