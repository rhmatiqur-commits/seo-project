import { test } from "node:test";
import assert from "node:assert/strict";
import { detectMissingPages, type KeywordForMissingPage } from "./missing-page";
import type { PageForMatching } from "@/lib/search-performance/types";
import type { QueryAggregate } from "@/lib/search-performance/comparison";

const UNRELATED_PAGE: PageForMatching = { id: "page-1", url: "/about-us", title: "About Us", h1: "About Us", headings: [], metaDescription: null };
const RELEVANT_PAGE: PageForMatching = {
  id: "page-2",
  url: "/landlord-accountant",
  title: "Landlord Accountant Coventry",
  h1: "Landlord Accountant Coventry",
  headings: [],
  metaDescription: "Landlord accountant services in Coventry.",
};

test("flags a keyword with real provider search volume and no adequate page", () => {
  const keyword: KeywordForMissingPage = { id: "kw-1", keyword: "landlord accountant Coventry", searchVolume: 320 };
  const results = detectMissingPages([keyword], new Map(), [UNRELATED_PAGE]);
  assert.equal(results.length, 1);
  assert.equal(results[0]!.recommendedAction, "CREATE_NEW_PAGE");
  assert.equal((results[0]!.signals as Record<string, unknown>).searchVolumeSource, "provider");
});

test("flags a keyword with meaningful GSC impressions even with no provider data", () => {
  const keyword: KeywordForMissingPage = { id: "kw-2", keyword: "cheap landlord accountant", searchVolume: null };
  const aggMap = new Map<string, QueryAggregate>([
    ["cheap landlord accountant", { normalizedQuery: "cheap landlord accountant", originalQuery: "cheap landlord accountant", clicks: 2, impressions: 200, ctr: 0.01, position: 15, topPageUrl: null }],
  ]);
  const results = detectMissingPages([keyword], aggMap, [UNRELATED_PAGE]);
  assert.equal(results.length, 1);
});

test("does not flag a keyword with neither provider volume nor meaningful GSC impressions", () => {
  const keyword: KeywordForMissingPage = { id: "kw-3", keyword: "nobody searches this", searchVolume: null };
  const results = detectMissingPages([keyword], new Map(), [UNRELATED_PAGE]);
  assert.equal(results.length, 0);
});

test("does not flag a keyword already adequately covered by an existing page", () => {
  const keyword: KeywordForMissingPage = { id: "kw-4", keyword: "landlord accountant Coventry", searchVolume: 500 };
  const results = detectMissingPages([keyword], new Map(), [RELEVANT_PAGE]);
  assert.equal(results.length, 0);
});
