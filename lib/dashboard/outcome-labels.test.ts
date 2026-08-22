import { test } from "node:test";
import assert from "node:assert/strict";
import { classificationLabel, classificationTone, recommendationLabel, OUTCOME_MEASURING_LABEL } from "./outcome-labels";
import type { OutcomeClassification, OutcomeRecommendation } from "@/lib/supabase/types";

const ALL_CLASSIFICATIONS: OutcomeClassification[] = ["POSITIVE", "NEGATIVE", "MIXED", "INCONCLUSIVE", "INSUFFICIENT_DATA"];
const ALL_RECOMMENDATIONS: OutcomeRecommendation[] = ["MONITOR", "INVESTIGATE_CTR", "DIAGNOSE_DECLINE", "WAIT_FOR_MORE_DATA"];

test("classificationLabel matches the wording the Outcomes page has always shown", () => {
  assert.equal(classificationLabel("POSITIVE"), "Improved");
  assert.equal(classificationLabel("NEGATIVE"), "Declined");
  assert.equal(classificationLabel("MIXED"), "Mixed result");
  assert.equal(classificationLabel("INCONCLUSIVE"), "No clear change yet");
  assert.equal(classificationLabel("INSUFFICIENT_DATA"), "Still gathering data");
});

test("classificationLabel: no raw SHOUTING_CASE reaches a client for any classification", () => {
  for (const c of ALL_CLASSIFICATIONS) {
    const label = classificationLabel(c);
    assert.doesNotMatch(label, /^[A-Z_]+$/);
  }
});

test("classificationTone: POSITIVE reads success, NEGATIVE reads danger, MIXED reads warning", () => {
  assert.equal(classificationTone("POSITIVE"), "success");
  assert.equal(classificationTone("NEGATIVE"), "danger");
  assert.equal(classificationTone("MIXED"), "warning");
});

test("classificationTone: every classification maps to a real dash-badge tone", () => {
  const validTones = new Set(["success", "warning", "danger", "info", "neutral", "brand"]);
  for (const c of ALL_CLASSIFICATIONS) {
    assert.ok(validTones.has(classificationTone(c)), `${c} -> ${classificationTone(c)} is not a known dash-badge tone`);
  }
});

test("recommendationLabel matches the wording the Outcomes page has always shown", () => {
  assert.equal(recommendationLabel("MONITOR"), "Monitoring — no action needed");
  assert.equal(recommendationLabel("INVESTIGATE_CTR"), "Worth investigating: click-through rate");
  assert.equal(recommendationLabel("DIAGNOSE_DECLINE"), "Needs a closer look");
  assert.equal(recommendationLabel("WAIT_FOR_MORE_DATA"), "Waiting for more data");
});

test("recommendationLabel: no raw SHOUTING_CASE reaches a client for any recommendation", () => {
  for (const r of ALL_RECOMMENDATIONS) {
    assert.doesNotMatch(recommendationLabel(r), /^[A-Z_]+$/);
  }
});

test("OUTCOME_MEASURING_LABEL matches the Outcomes page's existing 'no outcome row yet' copy", () => {
  assert.equal(OUTCOME_MEASURING_LABEL, "Baseline being established");
});
