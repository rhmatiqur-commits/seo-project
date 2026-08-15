import { test } from "node:test";
import assert from "node:assert/strict";
import { scorePageMatch, findBestPageMatch, type MatchablePage } from "./matching";

function page(overrides: Partial<MatchablePage> = {}): MatchablePage {
  return {
    url: "https://example.com/page",
    title: null,
    h1: null,
    headings: [],
    metaDescription: null,
    ...overrides,
  };
}

test("scorePageMatch: exact title match scores highest and is typed 'title'", () => {
  const result = scorePageMatch("landlord accountant", page({ title: "Landlord Accountant Services" }));
  assert.equal(result.matchType, "title");
  assert.equal(result.relevanceScore, 40);
});

test("scorePageMatch: no overlap anywhere returns 'none' with score 0 (missing-page case)", () => {
  const result = scorePageMatch("landlord accountant coventry", page({ title: "About Us", h1: "Our Story" }));
  assert.equal(result.matchType, "none");
  assert.equal(result.relevanceScore, 0);
});

test("scorePageMatch: partial word overlap scores proportionally, not all-or-nothing", () => {
  const full = scorePageMatch("cv builder", page({ title: "CV Builder" }));
  const partial = scorePageMatch("cv builder online", page({ title: "CV Builder" }));
  assert.ok(partial.relevanceScore > 0);
  assert.ok(partial.relevanceScore < full.relevanceScore);
});

test("scorePageMatch: combines multiple fields, capped by weights summing to 100", () => {
  const result = scorePageMatch(
    "cv builder",
    page({ title: "CV Builder", h1: "CV Builder", headings: ["CV Builder"], metaDescription: "CV Builder tool", url: "https://example.com/cv-builder" })
  );
  assert.equal(result.relevanceScore, 100);
});

test("findBestPageMatch: picks the highest-scoring page (existing-page detection)", () => {
  const pages = [page({ url: "https://example.com/a", title: "About" }), page({ url: "https://example.com/b", title: "CV Builder UK" })];
  const best = findBestPageMatch("cv builder", pages);
  assert.ok(best);
  assert.equal(best!.page.url, "https://example.com/b");
});

test("findBestPageMatch: returns null when no page matches (missing-page detection)", () => {
  const pages = [page({ title: "About Us" }), page({ title: "Contact" })];
  assert.equal(findBestPageMatch("landlord accountant coventry", pages), null);
});
