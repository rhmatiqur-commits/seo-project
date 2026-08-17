import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateAlertCandidates } from "./alerts";
import type { OutcomeDeltas } from "./types";

function deltas(partial: Partial<OutcomeDeltas>): OutcomeDeltas {
  return { clicksChange: 0, clicksChangePct: null, impressionsChange: 0, impressionsChangePct: null, ctrChangePoints: 0, positionChange: null, ...partial };
}

test("evaluateAlertCandidates: a small movement below every threshold produces no alerts (no spam)", () => {
  const candidates = evaluateAlertCandidates({ classification: "INCONCLUSIVE", deltas: deltas({ clicksChangePct: 2, positionChange: 0.5 }), isNewPage: false, currentImpressions: 10 });
  assert.deepEqual(candidates, []);
});

test("evaluateAlertCandidates: a significant ranking decline fires RANKING_DECLINE at critical severity", () => {
  const candidates = evaluateAlertCandidates({ classification: "NEGATIVE", deltas: deltas({ positionChange: -6 }), isNewPage: false, currentImpressions: 100 });
  assert.ok(candidates.some((c) => c.alertType === "RANKING_DECLINE" && c.severity === "critical"));
});

test("evaluateAlertCandidates: a significant clicks decline fires TRAFFIC_DECLINE", () => {
  const candidates = evaluateAlertCandidates({ classification: "NEGATIVE", deltas: deltas({ clicksChangePct: -40 }), isNewPage: false, currentImpressions: 100 });
  assert.ok(candidates.some((c) => c.alertType === "TRAFFIC_DECLINE"));
});

test("evaluateAlertCandidates: a POSITIVE outcome with a large clicks increase fires SUCCESSFUL_IMPROVEMENT", () => {
  const candidates = evaluateAlertCandidates({ classification: "POSITIVE", deltas: deltas({ clicksChangePct: 50 }), isNewPage: false, currentImpressions: 100 });
  assert.ok(candidates.some((c) => c.alertType === "SUCCESSFUL_IMPROVEMENT"));
});

test("evaluateAlertCandidates: a new page crossing the traction threshold fires NEW_PAGE_TRACTION", () => {
  const candidates = evaluateAlertCandidates({ classification: "POSITIVE", deltas: deltas({}), isNewPage: true, currentImpressions: 150 });
  assert.ok(candidates.some((c) => c.alertType === "NEW_PAGE_TRACTION"));
});

test("evaluateAlertCandidates: an existing (non-new) page never fires NEW_PAGE_TRACTION regardless of impressions", () => {
  const candidates = evaluateAlertCandidates({ classification: "POSITIVE", deltas: deltas({}), isNewPage: false, currentImpressions: 500 });
  assert.equal(candidates.some((c) => c.alertType === "NEW_PAGE_TRACTION"), false);
});

test("evaluateAlertCandidates: multiple thresholds can fire together (e.g. ranking decline + traffic decline)", () => {
  const candidates = evaluateAlertCandidates({ classification: "NEGATIVE", deltas: deltas({ positionChange: -8, clicksChangePct: -50 }), isNewPage: false, currentImpressions: 100 });
  assert.equal(candidates.length, 2);
});
