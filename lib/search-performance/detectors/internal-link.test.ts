import { test } from "node:test";
import assert from "node:assert/strict";
import { detectInternalLinkOpportunities, type KeywordForInternalLink } from "./internal-link";
import type { PageForMatching } from "@/lib/search-performance/types";

const TARGET: PageForMatching = {
  id: "target-page",
  url: "/landlord-accountant",
  title: "Landlord Accountant Coventry",
  h1: "Landlord Accountant Coventry",
  headings: ["Landlord tax returns"],
  metaDescription: "Specialist landlord accountant covering Coventry.",
};
const SOURCE: PageForMatching = {
  id: "source-page",
  url: "/blog/buy-to-let-tax-tips",
  title: "Buy-to-Let Tax Tips for Landlords",
  h1: "Buy-to-Let Tax Tips",
  headings: ["Landlord accountant advice", "Coventry rental market"],
  metaDescription: "Tax tips for landlords, including when to use a landlord accountant.",
};
const UNRELATED: PageForMatching = { id: "unrelated-page", url: "/careers", title: "Careers", h1: "Careers", headings: [], metaDescription: null };
const KEYWORD: KeywordForInternalLink = { id: "kw-1", keyword: "landlord accountant Coventry" };

test("suggests a link from a relevant source page to the best-matching target page", () => {
  const results = detectInternalLinkOpportunities([KEYWORD], [TARGET, SOURCE, UNRELATED], new Set());
  assert.equal(results.length, 1);
  assert.equal(results[0]!.recommendedAction, "IMPROVE_INTERNAL_LINKING");
  assert.equal(results[0]!.pageId, "target-page");
  assert.equal(results[0]!.relatedPageId, "source-page");
});

test("does not suggest a link that already exists", () => {
  const results = detectInternalLinkOpportunities([KEYWORD], [TARGET, SOURCE], new Set(["source-page->target-page"]));
  assert.equal(results.length, 0);
});

test("does not suggest anything when only one page is relevant enough (no candidate source)", () => {
  const results = detectInternalLinkOpportunities([KEYWORD], [TARGET, UNRELATED], new Set());
  assert.equal(results.length, 0);
});

test("does not blindly link an irrelevant page just because it exists", () => {
  const results = detectInternalLinkOpportunities([KEYWORD], [TARGET, UNRELATED], new Set());
  assert.ok(!results.some((r) => r.relatedPageId === "unrelated-page"));
});

test("caps candidate sources per keyword at the configured limit", () => {
  const manySources: PageForMatching[] = Array.from({ length: 5 }, (_, i) => ({
    id: `source-${i}`,
    url: `/blog/landlord-tips-${i}`,
    title: "Landlord Accountant Coventry Tips",
    h1: "Landlord Accountant Coventry",
    headings: ["Coventry landlord advice"],
    metaDescription: "Landlord accountant Coventry advice.",
  }));
  const results = detectInternalLinkOpportunities([KEYWORD], [TARGET, ...manySources], new Set());
  assert.ok(results.length <= 2); // MAX_INTERNAL_LINK_SOURCES_PER_KEYWORD
});
