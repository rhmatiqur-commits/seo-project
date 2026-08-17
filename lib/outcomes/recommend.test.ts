import { test } from "node:test";
import assert from "node:assert/strict";
import { recommendNextAction } from "./recommend";

test("recommendNextAction: POSITIVE -> MONITOR (never automatically keep changing a successful page)", () => {
  const result = recommendNextAction({ classification: "POSITIVE", ctrChangePoints: 1, clicksChangePct: 20 });
  assert.equal(result.recommendation, "MONITOR");
});

test("recommendNextAction: NEGATIVE -> DIAGNOSE_DECLINE", () => {
  const result = recommendNextAction({ classification: "NEGATIVE", ctrChangePoints: -1, clicksChangePct: -20 });
  assert.equal(result.recommendation, "DIAGNOSE_DECLINE");
});

test("recommendNextAction: MIXED with clicks up + CTR down -> INVESTIGATE_CTR (the spec's exact example)", () => {
  const result = recommendNextAction({ classification: "MIXED", ctrChangePoints: -2, clicksChangePct: 30 });
  assert.equal(result.recommendation, "INVESTIGATE_CTR");
});

test("recommendNextAction: MIXED without the clicks-up/CTR-down shape falls back to DIAGNOSE_DECLINE", () => {
  const result = recommendNextAction({ classification: "MIXED", ctrChangePoints: 1, clicksChangePct: -10 });
  assert.equal(result.recommendation, "DIAGNOSE_DECLINE");
});

test("recommendNextAction: INCONCLUSIVE -> WAIT_FOR_MORE_DATA (never modify the page)", () => {
  const result = recommendNextAction({ classification: "INCONCLUSIVE", ctrChangePoints: 0, clicksChangePct: 1 });
  assert.equal(result.recommendation, "WAIT_FOR_MORE_DATA");
});

test("recommendNextAction: INSUFFICIENT_DATA -> WAIT_FOR_MORE_DATA", () => {
  const result = recommendNextAction({ classification: "INSUFFICIENT_DATA", ctrChangePoints: 0, clicksChangePct: null });
  assert.equal(result.recommendation, "WAIT_FOR_MORE_DATA");
});
