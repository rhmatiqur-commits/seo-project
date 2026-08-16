import { test } from "node:test";
import assert from "node:assert/strict";
import { computeQaResult } from "./compute-result";
import type { DeterministicCheckResult } from "./deterministic";
import type { ContentQaDraft } from "@/lib/ai/schemas";

function check(overrides: Partial<DeterministicCheckResult>): DeterministicCheckResult {
  return { id: "id", label: "label", severity: "blocking", passed: true, message: "ok", ...overrides };
}

const GOOD_AI: ContentQaDraft = {
  search_intent_alignment: 5,
  topical_coverage: 5,
  usefulness: 5,
  clarity: 5,
  business_relevance: 5,
  competitor_gap_coverage: 5,
  addresses_likely_question: true,
  feels_generic_or_repetitive: false,
  notes: "Strong, specific draft.",
};

test("all checks passing + strong AI rating -> passed, high score", () => {
  const result = computeQaResult([check({ id: "a" }), check({ id: "b" })], GOOD_AI);
  assert.equal(result.passed, true);
  assert.ok(result.score >= 90);
});

test("a single failing blocking check fails the whole result regardless of score", () => {
  const result = computeQaResult([check({ id: "a" }), check({ id: "b", passed: false })], GOOD_AI);
  assert.equal(result.passed, false);
  assert.ok(result.issues.some((i) => i.severity === "blocking" && i.category === "b"));
});

test("a failing warning check never fails the result by itself (with enough other checks passing to keep score above threshold)", () => {
  const checks = [
    check({ id: "a", severity: "warning", passed: false }),
    ...Array.from({ length: 9 }, (_, i) => check({ id: `pass-${i}` })),
  ];
  const result = computeQaResult(checks, GOOD_AI);
  assert.equal(result.passed, true);
  assert.ok(result.issues.some((i) => i.severity === "warning" && i.category === "a"));
});

test("null AI (skipped/failed call) still produces a valid deterministic-only result", () => {
  const result = computeQaResult([check({ id: "a" })], null);
  assert.equal(result.passed, true);
  assert.equal(result.score, 100);
});

test("AI never gates pass/fail by itself — a weak AI rating with all blocking checks passed can still fail on score, but is never the sole authority", () => {
  const weakAi: ContentQaDraft = { ...GOOD_AI, usefulness: 1, clarity: 1, feels_generic_or_repetitive: true, addresses_likely_question: false };
  const result = computeQaResult([check({ id: "a" }), check({ id: "b" })], weakAi);
  // Deterministic-only would have scored 100; the AI component pulls it down — but this is a documented formula, not the AI's own verdict.
  assert.ok(result.score < 100);
});

test("AI notes and generic/intent flags surface as non-blocking issues", () => {
  const result = computeQaResult([check({ id: "a" })], { ...GOOD_AI, feels_generic_or_repetitive: true, addresses_likely_question: false });
  assert.ok(result.issues.some((i) => i.category === "ai_generic_feel"));
  assert.ok(result.issues.some((i) => i.category === "ai_intent_gap"));
  assert.ok(result.issues.every((i) => i.severity !== "blocking" || i.category !== "ai_generic_feel"));
});
