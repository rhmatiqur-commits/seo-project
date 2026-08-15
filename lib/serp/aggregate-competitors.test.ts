import { test } from "node:test";
import assert from "node:assert/strict";
import { aggregateCompetitorDomains } from "./aggregate-competitors";

test("aggregateCompetitorDomains counts appearances and distinct keywords per domain", () => {
  const rows = [
    { domain: "rival.co.uk", keywordId: "kw-1", position: 3, isCommercialKeyword: true },
    { domain: "rival.co.uk", keywordId: "kw-2", position: 5, isCommercialKeyword: false },
    { domain: "rival.co.uk", keywordId: "kw-1", position: 3, isCommercialKeyword: true }, // duplicate keyword, different run
  ];
  const [agg] = aggregateCompetitorDomains(rows, new Set());
  assert.equal(agg!.domain, "rival.co.uk");
  assert.equal(agg!.appearances, 3);
  assert.equal(agg!.relevantKeywordCount, 2); // distinct keyword ids
});

test("aggregateCompetitorDomains computes an impressions-free average position", () => {
  const rows = [
    { domain: "rival.co.uk", keywordId: "kw-1", position: 2, isCommercialKeyword: false },
    { domain: "rival.co.uk", keywordId: "kw-2", position: 8, isCommercialKeyword: false },
  ];
  const [agg] = aggregateCompetitorDomains(rows, new Set());
  assert.equal(agg!.averagePosition, 5);
});

test("aggregateCompetitorDomains classifies a known directory regardless of appearance count", () => {
  const rows = [{ domain: "yell.com", keywordId: "kw-1", position: 1, isCommercialKeyword: false }];
  const [agg] = aggregateCompetitorDomains(rows, new Set());
  assert.equal(agg!.classification, "DIRECTORY");
});

test("aggregateCompetitorDomains classifies an unrecognised domain as DIRECT_COMPETITOR once it repeats", () => {
  const rows = [
    { domain: "rival.co.uk", keywordId: "kw-1", position: 3, isCommercialKeyword: false },
    { domain: "rival.co.uk", keywordId: "kw-2", position: 5, isCommercialKeyword: false },
  ];
  const [agg] = aggregateCompetitorDomains(rows, new Set());
  assert.equal(agg!.classification, "DIRECT_COMPETITOR");
});

test("aggregateCompetitorDomains counts target-keyword overlap toward the relevance score input", () => {
  const rows = [
    { domain: "rival.co.uk", keywordId: "kw-1", position: 3, isCommercialKeyword: false },
    { domain: "rival.co.uk", keywordId: "kw-2", position: 5, isCommercialKeyword: false },
  ];
  const withOverlap = aggregateCompetitorDomains(rows, new Set(["kw-1", "kw-2"]));
  const withoutOverlap = aggregateCompetitorDomains(rows, new Set());
  assert.ok(withOverlap[0]!.relevanceScore > withoutOverlap[0]!.relevanceScore);
});

test("aggregateCompetitorDomains returns results sorted by relevance score descending", () => {
  const rows = [
    { domain: "small-rival.co.uk", keywordId: "kw-1", position: 40, isCommercialKeyword: false },
    { domain: "big-rival.co.uk", keywordId: "kw-1", position: 1, isCommercialKeyword: true },
    { domain: "big-rival.co.uk", keywordId: "kw-2", position: 1, isCommercialKeyword: true },
  ];
  const results = aggregateCompetitorDomains(rows, new Set());
  assert.equal(results[0]!.domain, "big-rival.co.uk");
});

test("aggregateCompetitorDomains handles an empty input", () => {
  assert.deepEqual(aggregateCompetitorDomains([], new Set()), []);
});
