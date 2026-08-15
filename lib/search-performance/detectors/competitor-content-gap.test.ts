import { test } from "node:test";
import assert from "node:assert/strict";
import { detectCompetitorContentGaps } from "./competitor-content-gap";
import type { KeywordCompetitiveSignal } from "./competitor-shared";
import type { PageForMatching } from "@/lib/search-performance/types";

const UNRELATED_PAGE: PageForMatching = { id: "page-1", url: "/about", title: "About Us", h1: "About Us", headings: [], metaDescription: null };
const RELEVANT_PAGE: PageForMatching = {
  id: "page-2",
  url: "/landlord-accountant",
  title: "Landlord Accountant Coventry",
  h1: "Landlord Accountant Coventry",
  headings: [],
  metaDescription: "Landlord accountant Coventry.",
};

function signal(overrides: Partial<KeywordCompetitiveSignal>): KeywordCompetitiveSignal {
  return {
    keyword: "landlord accountant Coventry",
    keywordId: "kw-1",
    clientPosition: null,
    competitors: [{ domain: "rival-accountants.co.uk", classification: "DIRECT_COMPETITOR", position: 4, url: "https://rival-accountants.co.uk/landlord", pageTitle: "Landlord Accountants" }],
    ...overrides,
  };
}

test("flags a keyword where a direct competitor ranks well and the client has no adequate page", () => {
  const results = detectCompetitorContentGaps([signal({})], [UNRELATED_PAGE]);
  assert.equal(results.length, 1);
  assert.equal(results[0]!.recommendedAction, "CREATE_NEW_PAGE");
});

test("does not flag when the client already has an adequately relevant page", () => {
  const results = detectCompetitorContentGaps([signal({})], [RELEVANT_PAGE]);
  assert.equal(results.length, 0);
});

test("does not flag when the client already ranks reasonably (ranking-gap's territory)", () => {
  const results = detectCompetitorContentGaps([signal({ clientPosition: 6 })], [UNRELATED_PAGE]);
  assert.equal(results.length, 0);
});

test("does not flag a directory/marketplace competitor, only DIRECT_COMPETITOR", () => {
  const results = detectCompetitorContentGaps(
    [signal({ competitors: [{ domain: "yell.com", classification: "DIRECTORY", position: 2, url: "https://yell.com/x", pageTitle: null }] })],
    [UNRELATED_PAGE]
  );
  assert.equal(results.length, 0);
});

test("does not flag when the competitor itself ranks poorly (not evidence of a worthwhile gap)", () => {
  const results = detectCompetitorContentGaps(
    [signal({ competitors: [{ domain: "rival.co.uk", classification: "DIRECT_COMPETITOR", position: 40, url: "https://rival.co.uk/x", pageTitle: null }] })],
    [UNRELATED_PAGE]
  );
  assert.equal(results.length, 0);
});
