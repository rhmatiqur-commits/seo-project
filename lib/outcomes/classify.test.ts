import { test } from "node:test";
import assert from "node:assert/strict";
import { assessDataSufficiency, classifyOutcome } from "./classify";
import { computeOutcomeDeltas } from "./deltas";
import type { WindowMetrics } from "./types";

function metrics(partial: Partial<WindowMetrics>): WindowMetrics {
  return { clicks: 0, impressions: 0, ctr: 0, position: null, ...partial };
}

test("assessDataSufficiency: existing page/keyword needs meaningful impressions on both sides", () => {
  const result = assessDataSufficiency(metrics({ impressions: 5 }), metrics({ impressions: 100 }), false);
  assert.equal(result.sufficient, false);
});

test("assessDataSufficiency: existing page/keyword with enough impressions on both sides is sufficient", () => {
  const result = assessDataSufficiency(metrics({ impressions: 100 }), metrics({ impressions: 100 }), false);
  assert.equal(result.sufficient, true);
});

test("assessDataSufficiency: brand-new page only needs current-period impressions (no baseline exists)", () => {
  const insufficient = assessDataSufficiency(metrics({ impressions: 0 }), metrics({ impressions: 5 }), true);
  assert.equal(insufficient.sufficient, false);
  const sufficient = assessDataSufficiency(metrics({ impressions: 0 }), metrics({ impressions: 50 }), true);
  assert.equal(sufficient.sufficient, true);
});

test("classifyOutcome: insufficient data short-circuits to INSUFFICIENT_DATA regardless of the deltas", () => {
  const baseline = metrics({ clicks: 100, impressions: 5, position: 3 });
  const current = metrics({ clicks: 200, impressions: 8, position: 1 });
  const deltas = computeOutcomeDeltas(baseline, current);
  const sufficiency = assessDataSufficiency(baseline, current, false);
  const result = classifyOutcome(baseline, current, deltas, sufficiency);
  assert.equal(result.classification, "INSUFFICIENT_DATA");
});

test("classifyOutcome: clicks, impressions, and position all improving meaningfully -> POSITIVE", () => {
  const baseline = metrics({ clicks: 10, impressions: 100, position: 14 });
  const current = metrics({ clicks: 15, impressions: 130, position: 9 });
  const deltas = computeOutcomeDeltas(baseline, current);
  const sufficiency = assessDataSufficiency(baseline, current, false);
  const result = classifyOutcome(baseline, current, deltas, sufficiency);
  assert.equal(result.classification, "POSITIVE");
  assert.match(result.reasoning, /9/);
});

test("classifyOutcome: everything declining meaningfully -> NEGATIVE", () => {
  const baseline = metrics({ clicks: 15, impressions: 130, position: 9 });
  const current = metrics({ clicks: 10, impressions: 100, position: 14 });
  const deltas = computeOutcomeDeltas(baseline, current);
  const sufficiency = assessDataSufficiency(baseline, current, false);
  const result = classifyOutcome(baseline, current, deltas, sufficiency);
  assert.equal(result.classification, "NEGATIVE");
});

test("classifyOutcome: clicks increased but position declined -> MIXED, never auto-POSITIVE from one improving metric", () => {
  const baseline = metrics({ clicks: 10, impressions: 100, position: 5 });
  const current = metrics({ clicks: 20, impressions: 100, position: 12 });
  const deltas = computeOutcomeDeltas(baseline, current);
  const sufficiency = assessDataSufficiency(baseline, current, false);
  const result = classifyOutcome(baseline, current, deltas, sufficiency);
  assert.equal(result.classification, "MIXED");
});

test("classifyOutcome: small movements below every threshold -> INCONCLUSIVE, not POSITIVE or NEGATIVE", () => {
  const baseline = metrics({ clicks: 100, impressions: 1000, position: 10 });
  const current = metrics({ clicks: 102, impressions: 1010, position: 10.5 });
  const deltas = computeOutcomeDeltas(baseline, current);
  const sufficiency = assessDataSufficiency(baseline, current, false);
  const result = classifyOutcome(baseline, current, deltas, sufficiency);
  assert.equal(result.classification, "INCONCLUSIVE");
});

test("classifyOutcome: never states a causal 'our change caused X' claim in its reasoning", () => {
  const baseline = metrics({ clicks: 10, impressions: 100, position: 14 });
  const current = metrics({ clicks: 15, impressions: 130, position: 9 });
  const deltas = computeOutcomeDeltas(baseline, current);
  const sufficiency = assessDataSufficiency(baseline, current, false);
  const result = classifyOutcome(baseline, current, deltas, sufficiency);
  assert.doesNotMatch(result.reasoning.toLowerCase(), /caused|because our|due to our change/);
});
