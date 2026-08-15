import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeKeyword, isSameKeyword, dedupeKeywords } from "./normalize";

test("normalizeKeyword trims, lowercases, and collapses whitespace", () => {
  assert.equal(normalizeKeyword("  Landlord   Accountant Coventry  "), "landlord accountant coventry");
});

test("isSameKeyword treats case/spacing variants as identical", () => {
  assert.ok(isSameKeyword("CV Builder UK", "cv builder   uk"));
  assert.ok(!isSameKeyword("cv builder uk", "cv builder ireland"));
});

test("dedupeKeywords removes normalized duplicates, keeping first occurrence", () => {
  const result = dedupeKeywords(["CV Builder", "cv builder", "  CV BUILDER  ", "ATS Checker"]);
  assert.deepEqual(result, ["CV Builder", "ATS Checker"]);
});

test("dedupeKeywords drops empty/whitespace-only entries", () => {
  assert.deepEqual(dedupeKeywords(["", "   ", "Real Keyword"]), ["Real Keyword"]);
});
