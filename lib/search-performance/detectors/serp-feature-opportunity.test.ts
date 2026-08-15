import { test } from "node:test";
import assert from "node:assert/strict";
import { detectSerpFeatureOpportunities, type KeywordSerpFeatureSignal } from "./serp-feature-opportunity";

const NO_FEATURES = { localPack: false, featuredSnippet: false, reviews: false, faq: false, video: false, sitelinks: false, shopping: false, other: [] };

function signal(overrides: Partial<KeywordSerpFeatureSignal>): KeywordSerpFeatureSignal {
  return {
    keyword: "landlord accountant Coventry",
    keywordId: "kw-1",
    features: NO_FEATURES,
    clientHoldsFeaturedSnippet: false,
    clientHoldsLocalPack: false,
    isHighPriority: true,
    ...overrides,
  };
}

test("flags a featured snippet the client doesn't hold on a high-priority keyword", () => {
  const results = detectSerpFeatureOpportunities([signal({ features: { ...NO_FEATURES, featuredSnippet: true } })]);
  assert.equal(results.length, 1);
  assert.equal(results[0]!.recommendedAction, "IMPROVE_CTR");
});

test("does not flag a feature the client already holds", () => {
  const results = detectSerpFeatureOpportunities([signal({ features: { ...NO_FEATURES, featuredSnippet: true }, clientHoldsFeaturedSnippet: true })]);
  assert.equal(results.length, 0);
});

test("does not flag a keyword with no SERP features at all", () => {
  const results = detectSerpFeatureOpportunities([signal({})]);
  assert.equal(results.length, 0);
});

test("does not flag a low-priority keyword even with a missed feature", () => {
  const results = detectSerpFeatureOpportunities([signal({ features: { ...NO_FEATURES, localPack: true }, isHighPriority: false })]);
  assert.equal(results.length, 0);
});

test("flags a local pack opportunity separately from featured snippet", () => {
  const results = detectSerpFeatureOpportunities([signal({ features: { ...NO_FEATURES, localPack: true } })]);
  assert.equal(results.length, 1);
  assert.ok((results[0]!.signals as { missedFeatures: string[] }).missedFeatures.includes("local pack"));
});

test("multiple missed features increase the opportunity magnitude", () => {
  const one = detectSerpFeatureOpportunities([signal({ features: { ...NO_FEATURES, featuredSnippet: true } })]);
  const two = detectSerpFeatureOpportunities([signal({ features: { ...NO_FEATURES, featuredSnippet: true, localPack: true } })]);
  assert.ok(two[0]!.opportunityMagnitude > one[0]!.opportunityMagnitude);
});
