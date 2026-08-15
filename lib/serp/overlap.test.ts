import { test } from "node:test";
import assert from "node:assert/strict";
import { computeKeywordOverlap } from "./overlap";

test("computeKeywordOverlap finds keywords present for both client and competitor (shared)", () => {
  const result = computeKeywordOverlap(["Landlord Accountant Coventry", "CV Builder"], ["landlord accountant  coventry", "tax return help"]);
  assert.deepEqual(result.shared, ["landlord accountant coventry"]);
});

test("computeKeywordOverlap finds competitor-only keywords", () => {
  const result = computeKeywordOverlap(["cv builder"], ["cv builder", "tax return help", "self assessment"]);
  assert.deepEqual(result.competitorOnly.sort(), ["self assessment", "tax return help"]);
});

test("computeKeywordOverlap finds client-only keywords", () => {
  const result = computeKeywordOverlap(["cv builder", "ats cv checker"], ["cv builder"]);
  assert.deepEqual(result.clientOnly.sort(), ["ats cv checker"]);
});

test("computeKeywordOverlap is case/whitespace-insensitive (same normalizeKeyword used across sources)", () => {
  const result = computeKeywordOverlap(["Landlord  Accountant"], ["landlord accountant"]);
  assert.equal(result.shared.length, 1);
  assert.equal(result.competitorOnly.length, 0);
  assert.equal(result.clientOnly.length, 0);
});

test("computeKeywordOverlap drops empty/whitespace-only entries", () => {
  const result = computeKeywordOverlap(["", "  ", "real keyword"], ["another"]);
  assert.deepEqual(result.clientOnly, ["real keyword"]);
});

test("computeKeywordOverlap handles two completely disjoint sets", () => {
  const result = computeKeywordOverlap(["a"], ["b"]);
  assert.deepEqual(result.shared, []);
  assert.deepEqual(result.clientOnly, ["a"]);
  assert.deepEqual(result.competitorOnly, ["b"]);
});
