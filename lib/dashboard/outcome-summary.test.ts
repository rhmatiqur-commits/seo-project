import { test } from "node:test";
import assert from "node:assert/strict";
import { buildOutcomeSummary } from "./outcome-summary";

test("returns all five groups in a stable order, even when byClassification is empty", () => {
  const groups = buildOutcomeSummary({});
  assert.deepEqual(
    groups.map((g) => g.key),
    ["POSITIVE", "NEGATIVE", "MIXED", "INCONCLUSIVE", "INSUFFICIENT_DATA"]
  );
  assert.ok(groups.every((g) => g.count === 0));
});

test("maps POSITIVE to the client-facing 'Improved' label, matching outcomes/page.tsx", () => {
  const groups = buildOutcomeSummary({ POSITIVE: 3 });
  const positive = groups.find((g) => g.key === "POSITIVE")!;
  assert.equal(positive.label, "Improved");
  assert.equal(positive.count, 3);
});

test("maps every classification to its outcomes/page.tsx label exactly", () => {
  const groups = buildOutcomeSummary({ NEGATIVE: 1, MIXED: 1, INCONCLUSIVE: 1, INSUFFICIENT_DATA: 1 });
  const byKey = Object.fromEntries(groups.map((g) => [g.key, g.label]));
  assert.equal(byKey.NEGATIVE, "Declined");
  assert.equal(byKey.MIXED, "Mixed result");
  assert.equal(byKey.INCONCLUSIVE, "No clear change yet");
  assert.equal(byKey.INSUFFICIENT_DATA, "Still gathering data");
});

test("an unrecognised key in the input is simply ignored, not added as a sixth group", () => {
  const groups = buildOutcomeSummary({ SOMETHING_ELSE: 99 });
  assert.equal(groups.length, 5);
});
