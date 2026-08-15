import { test } from "node:test";
import assert from "node:assert/strict";
import { extractSerpResults, extractSerpFeatures, normalizeSerpItems } from "./normalize";

const ORGANIC_ITEMS = [
  { type: "organic", rank_absolute: 1, domain: "competitor-a.co.uk", url: "https://competitor-a.co.uk/", title: "A", description: "Desc A" },
  { type: "organic", rank_absolute: 2, domain: "cvcentral.io", url: "https://cvcentral.io/", title: "CV Central", description: "Desc CV" },
  { type: "organic", rank_absolute: 3, domain: "competitor-b.co.uk", url: "https://competitor-b.co.uk/", title: "B", description: null },
];

test("extractSerpResults maps organic items to positioned results", () => {
  const results = extractSerpResults(ORGANIC_ITEMS);
  assert.equal(results.length, 3);
  assert.deepEqual(results[0], { position: 1, domain: "competitor-a.co.uk", url: "https://competitor-a.co.uk/", title: "A", description: "Desc A", resultType: "organic" });
});

test("extractSerpResults drops feature items (no stable domain/position of their own)", () => {
  const items = [...ORGANIC_ITEMS, { type: "local_pack" }, { type: "people_also_ask" }];
  const results = extractSerpResults(items);
  assert.equal(results.length, 3);
});

test("extractSerpResults drops items missing a domain, url, or position", () => {
  const items = [{ type: "organic", domain: "x.com" }, { type: "organic", url: "https://x.com" }, { type: "organic", rank_absolute: 5 }];
  assert.equal(extractSerpResults(items).length, 0);
});

test("extractSerpFeatures flags known feature types and dedupes 'other'", () => {
  const items = [{ type: "local_pack" }, { type: "featured_snippet" }, { type: "people_also_ask" }, { type: "some_new_feature" }, { type: "some_new_feature" }, { type: "organic" }];
  const features = extractSerpFeatures(items);
  assert.equal(features.localPack, true);
  assert.equal(features.featuredSnippet, true);
  assert.equal(features.faq, true);
  assert.equal(features.video, false);
  assert.deepEqual(features.other, ["some_new_feature"]);
});

test("extractSerpFeatures returns all-false/empty for a plain organic-only SERP", () => {
  const features = extractSerpFeatures(ORGANIC_ITEMS);
  assert.equal(features.localPack, false);
  assert.equal(features.featuredSnippet, false);
  assert.deepEqual(features.other, []);
});

test("normalizeSerpItems combines results + features from one pass", () => {
  const { results, features } = normalizeSerpItems([...ORGANIC_ITEMS, { type: "local_pack" }]);
  assert.equal(results.length, 3);
  assert.equal(features.localPack, true);
});
