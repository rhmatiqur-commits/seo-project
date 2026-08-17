import { test } from "node:test";
import assert from "node:assert/strict";
import { computeOutcomeDeltas } from "./deltas";
import type { WindowMetrics } from "./types";

function metrics(partial: Partial<WindowMetrics>): WindowMetrics {
  return { clicks: 0, impressions: 0, ctr: 0, position: null, ...partial };
}

test("computeOutcomeDeltas: position improving (14 -> 9) yields a positive positionChange", () => {
  const deltas = computeOutcomeDeltas(metrics({ position: 14 }), metrics({ position: 9 }));
  assert.equal(deltas.positionChange, 5);
});

test("computeOutcomeDeltas: position worsening (9 -> 14) yields a negative positionChange", () => {
  const deltas = computeOutcomeDeltas(metrics({ position: 9 }), metrics({ position: 14 }));
  assert.equal(deltas.positionChange, -5);
});

test("computeOutcomeDeltas: positionChange is null when either side has no position data", () => {
  assert.equal(computeOutcomeDeltas(metrics({ position: null }), metrics({ position: 9 })).positionChange, null);
  assert.equal(computeOutcomeDeltas(metrics({ position: 9 }), metrics({ position: null })).positionChange, null);
});

test("computeOutcomeDeltas: clicks/impressions percentage deltas", () => {
  const deltas = computeOutcomeDeltas(metrics({ clicks: 50, impressions: 1000 }), metrics({ clicks: 75, impressions: 1200 }));
  assert.equal(deltas.clicksChange, 25);
  assert.equal(deltas.clicksChangePct, 50);
  assert.equal(deltas.impressionsChange, 200);
  assert.equal(deltas.impressionsChangePct, 20);
});

test("computeOutcomeDeltas: percentage deltas are null when the baseline was zero", () => {
  const deltas = computeOutcomeDeltas(metrics({ clicks: 0, impressions: 0 }), metrics({ clicks: 10, impressions: 100 }));
  assert.equal(deltas.clicksChangePct, null);
  assert.equal(deltas.impressionsChangePct, null);
});

test("computeOutcomeDeltas: ctrChangePoints is expressed in percentage points, not a fraction", () => {
  const deltas = computeOutcomeDeltas(metrics({ ctr: 0.02 }), metrics({ ctr: 0.05 }));
  assert.equal(deltas.ctrChangePoints, 3);
});

test("computeOutcomeDeltas: CTR can decline even while clicks increase (the MIXED-result case)", () => {
  const baseline = metrics({ clicks: 10, impressions: 200, ctr: 0.05 });
  const current = metrics({ clicks: 20, impressions: 1000, ctr: 0.02 });
  const deltas = computeOutcomeDeltas(baseline, current);
  assert.ok(deltas.clicksChangePct! > 0);
  assert.ok(deltas.ctrChangePoints < 0);
});
