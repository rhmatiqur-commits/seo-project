import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeKeywordCandidates, type KeywordCandidate } from "./merge";

test("mergeKeywordCandidates: provider failure (empty list) still yields the AI candidates", () => {
  const ai: KeywordCandidate[] = [
    { keyword: "landlord accountant coventry", source: "ai_suggested" },
    { keyword: "cv builder uk", source: "ai_suggested" },
  ];
  const result = mergeKeywordCandidates([], ai);
  assert.equal(result.length, 2);
  assert.ok(result.every((c) => c.source === "ai_suggested"));
});

test("mergeKeywordCandidates: dedupes overlapping keywords, AI version wins", () => {
  const provider: KeywordCandidate[] = [{ keyword: "CV Builder UK", source: "provider" }];
  const ai: KeywordCandidate[] = [{ keyword: "cv builder uk", source: "ai_suggested" }];
  const result = mergeKeywordCandidates(provider, ai);
  assert.equal(result.length, 1);
  assert.equal(result[0]!.source, "ai_suggested");
});

test("mergeKeywordCandidates: distinct keywords from both sources are all kept", () => {
  const provider: KeywordCandidate[] = [{ keyword: "cv template", source: "provider" }];
  const ai: KeywordCandidate[] = [{ keyword: "cover letter generator", source: "ai_suggested" }];
  const result = mergeKeywordCandidates(provider, ai);
  assert.equal(result.length, 2);
});

test("mergeKeywordCandidates: both sources empty (double failure) returns empty, not an error", () => {
  assert.deepEqual(mergeKeywordCandidates([], []), []);
});
