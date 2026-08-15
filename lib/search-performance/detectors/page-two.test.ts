import { test } from "node:test";
import assert from "node:assert/strict";
import { detectPageTwoOpportunities } from "./page-two";
import type { PageForMatching } from "@/lib/search-performance/types";
import type { QueryAggregate } from "@/lib/search-performance/comparison";

const RELEVANT_PAGE: PageForMatching = {
  id: "page-1",
  url: "https://example.com/landlord-accountant",
  title: "Landlord Accountant Coventry | Example Accountants",
  h1: "Landlord Accountant Services in Coventry",
  headings: ["Why choose us", "Landlord tax returns"],
  metaDescription: "Specialist landlord accountant covering Coventry and the West Midlands.",
};

function agg(overrides: Partial<QueryAggregate>): QueryAggregate {
  return {
    normalizedQuery: "landlord accountant coventry",
    originalQuery: "landlord accountant Coventry",
    clicks: 37,
    impressions: 4200,
    ctr: 0.0088,
    position: 14,
    topPageUrl: RELEVANT_PAGE.url,
    ...overrides,
  };
}

test("flags a page-two query with meaningful impressions and an existing relevant page", () => {
  const [candidate] = detectPageTwoOpportunities([agg({})], new Map([["landlord accountant coventry", "kw-1"]]), [RELEVANT_PAGE]);
  assert.ok(candidate);
  assert.equal(candidate!.detectorType, "PAGE_TWO_OPPORTUNITY");
  assert.equal(candidate!.recommendedAction, "OPTIMISE_EXISTING_PAGE");
  assert.equal(candidate!.pageId, "page-1");
  assert.equal(candidate!.keywordId, "kw-1");
  assert.ok(candidate!.opportunityMagnitude >= 1 && candidate!.opportunityMagnitude <= 5);
});

test("does not flag a query outside the page-two position range", () => {
  const results = detectPageTwoOpportunities([agg({ position: 3 })], new Map(), [RELEVANT_PAGE]);
  assert.equal(results.length, 0);
  const results2 = detectPageTwoOpportunities([agg({ position: 25 })], new Map(), [RELEVANT_PAGE]);
  assert.equal(results2.length, 0);
});

test("does not flag a page-two query with negligible impressions", () => {
  const results = detectPageTwoOpportunities([agg({ impressions: 3 })], new Map(), [RELEVANT_PAGE]);
  assert.equal(results.length, 0);
});

test("does not flag a page-two query with no relevant existing page (that's MISSING_PAGE's job)", () => {
  const irrelevantPage: PageForMatching = { id: "page-2", url: "/unrelated", title: "Unrelated topic", h1: null, headings: [], metaDescription: null };
  const results = detectPageTwoOpportunities([agg({})], new Map(), [irrelevantPage]);
  assert.equal(results.length, 0);
});

test("scores opportunities closer to position 11 higher than those near position 20", () => {
  const [near11] = detectPageTwoOpportunities([agg({ position: 11 })], new Map(), [RELEVANT_PAGE]);
  const [near20] = detectPageTwoOpportunities([agg({ position: 20 })], new Map(), [RELEVANT_PAGE]);
  assert.ok(near11!.opportunityMagnitude > near20!.opportunityMagnitude);
});
