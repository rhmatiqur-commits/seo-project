import { test } from "node:test";
import assert from "node:assert/strict";
import { computeCompetitorRelevanceScore, positionStrength, relevantKeywordSignal, commercialCoverage, targetOverlap } from "./competitor-scoring";

test("positionStrength: better (lower) average position scores higher", () => {
  assert.ok(positionStrength(1) > positionStrength(20));
  assert.ok(positionStrength(20) > positionStrength(80));
});

test("positionStrength: null (no position data) is the minimum, not a crash", () => {
  assert.equal(positionStrength(null), 1);
});

test("relevantKeywordSignal: more relevant keywords scores higher, log-scaled", () => {
  assert.ok(relevantKeywordSignal(20) > relevantKeywordSignal(1));
  assert.equal(relevantKeywordSignal(0), 1);
});

test("commercialCoverage: higher commercial-keyword ratio scores higher", () => {
  assert.ok(commercialCoverage(8, 10) > commercialCoverage(1, 10));
  assert.equal(commercialCoverage(0, 0), 1);
});

test("targetOverlap: more overlap with the client's own target keywords scores higher", () => {
  assert.ok(targetOverlap(9, 10) > targetOverlap(1, 10));
});

test("computeCompetitorRelevanceScore: a strong, frequent, well-positioned competitor scores higher than a weak one", () => {
  const strong = computeCompetitorRelevanceScore({
    relevantKeywordCount: 25,
    averagePosition: 3,
    appearances: 20,
    commercialAppearances: 15,
    totalAppearances: 20,
    targetKeywordOverlapCount: 8,
    totalClientTargetKeywords: 10,
  });
  const weak = computeCompetitorRelevanceScore({
    relevantKeywordCount: 1,
    averagePosition: 60,
    appearances: 1,
    commercialAppearances: 0,
    totalAppearances: 1,
    targetKeywordOverlapCount: 0,
    totalClientTargetKeywords: 10,
  });
  assert.ok(strong > weak);
});

test("computeCompetitorRelevanceScore never returns a negative score", () => {
  const score = computeCompetitorRelevanceScore({
    relevantKeywordCount: 0,
    averagePosition: null,
    appearances: 0,
    commercialAppearances: 0,
    totalAppearances: 0,
    targetKeywordOverlapCount: 0,
    totalClientTargetKeywords: 0,
  });
  assert.ok(score >= 0);
});
