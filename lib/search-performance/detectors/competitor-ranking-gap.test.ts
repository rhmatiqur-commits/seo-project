import { test } from "node:test";
import assert from "node:assert/strict";
import { detectCompetitorRankingGaps } from "./competitor-ranking-gap";
import type { KeywordCompetitiveSignal } from "./competitor-shared";
import type { PageForMatching } from "@/lib/search-performance/types";

const CLIENT_PAGE: PageForMatching = {
  id: "page-1",
  url: "/accountant-coventry",
  title: "Accountant Coventry",
  h1: "Accountant Coventry",
  headings: [],
  metaDescription: "Accountant services in Coventry.",
};
const PAGE_ID_BY_URL = new Map([["/accountant-coventry", "page-1"]]);

function signal(overrides: Partial<KeywordCompetitiveSignal>): KeywordCompetitiveSignal {
  return {
    keyword: "accountant Coventry",
    keywordId: "kw-1",
    clientPosition: 17,
    competitors: [{ domain: "rival.co.uk", classification: "DIRECT_COMPETITOR", position: 3, url: "https://rival.co.uk/accountant", pageTitle: "Accountant" }],
    ...overrides,
  };
}

test("flags a substantial ranking gap (client 17, competitor 3)", () => {
  const results = detectCompetitorRankingGaps([signal({})], [CLIENT_PAGE], PAGE_ID_BY_URL);
  assert.equal(results.length, 1);
  assert.equal(results[0]!.recommendedAction, "OPTIMISE_EXISTING_PAGE");
  assert.equal(results[0]!.pageId, "page-1");
  assert.equal((results[0]!.signals as Record<string, unknown>).positionGap, 14);
});

test("does not flag when the client doesn't rank at all (content-gap's territory)", () => {
  const results = detectCompetitorRankingGaps([signal({ clientPosition: null })], [CLIENT_PAGE], PAGE_ID_BY_URL);
  assert.equal(results.length, 0);
});

test("does not flag an insignificant gap below the threshold", () => {
  const results = detectCompetitorRankingGaps(
    [signal({ clientPosition: 8, competitors: [{ domain: "rival.co.uk", classification: "DIRECT_COMPETITOR", position: 6, url: "x", pageTitle: null }] })],
    [CLIENT_PAGE],
    PAGE_ID_BY_URL
  );
  assert.equal(results.length, 0);
});

test("does not compare against a directory/marketplace, only DIRECT_COMPETITOR", () => {
  const results = detectCompetitorRankingGaps(
    [signal({ competitors: [{ domain: "yell.com", classification: "DIRECTORY", position: 1, url: "x", pageTitle: null }] })],
    [CLIENT_PAGE],
    PAGE_ID_BY_URL
  );
  assert.equal(results.length, 0);
});

test("bigger position gaps score a higher opportunityMagnitude", () => {
  const small = detectCompetitorRankingGaps([signal({ clientPosition: 10 })], [CLIENT_PAGE], PAGE_ID_BY_URL);
  const large = detectCompetitorRankingGaps([signal({ clientPosition: 30 })], [CLIENT_PAGE], PAGE_ID_BY_URL);
  assert.ok(large[0]!.opportunityMagnitude > small[0]!.opportunityMagnitude);
});
