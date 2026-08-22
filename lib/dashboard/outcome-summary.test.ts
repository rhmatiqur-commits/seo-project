import { test } from "node:test";
import assert from "node:assert/strict";
import { buildOutcomeSummaryViewModel } from "./outcome-summary";

const SAMPLE_OUTCOME = {
  classification: "POSITIVE" as const,
  classificationReasoning: "Observed change following the action: clicks +40% (10 -> 14).",
  recommendation: "MONITOR" as const,
  measurementWindowDays: 28,
};

test("precedence 1: an investigative type is 'not-measured' even with an action and a positive outcome present", () => {
  const vm = buildOutcomeSummaryViewModel({ opportunityType: "RESEARCH_REQUIRED", hasAction: true, outcome: SAMPLE_OUTCOME });
  assert.equal(vm.state, "not-measured");
  assert.equal(vm.tone, "neutral");
  assert.equal(vm.reasoning, null);
});

test("precedence 1 covers all 3 investigative types regardless of task/action state", () => {
  for (const type of ["RESEARCH_REQUIRED", "INVESTIGATE_DECLINE", "INVESTIGATE_OPPORTUNITY"] as const) {
    assert.equal(buildOutcomeSummaryViewModel({ opportunityType: type, hasAction: false, outcome: null }).state, "not-measured");
    assert.equal(buildOutcomeSummaryViewModel({ opportunityType: type, hasAction: true, outcome: null }).state, "not-measured");
    assert.equal(buildOutcomeSummaryViewModel({ opportunityType: type, hasAction: true, outcome: SAMPLE_OUTCOME }).state, "not-measured");
  }
});

test("precedence 2: a measurable type with no action yet is 'not-yet-live'", () => {
  const vm = buildOutcomeSummaryViewModel({ opportunityType: "TECHNICAL_FIX", hasAction: false, outcome: null });
  assert.equal(vm.state, "not-yet-live");
  assert.equal(vm.tone, "neutral");
});

test("precedence 3: a measurable type with an action but no outcome row yet is 'measuring', using the Outcomes page's own wording", () => {
  const vm = buildOutcomeSummaryViewModel({ opportunityType: "CREATE_NEW_PAGE", hasAction: true, outcome: null });
  assert.equal(vm.state, "measuring");
  assert.equal(vm.label, "Baseline being established");
  assert.equal(vm.tone, "info");
});

test("precedence 4: a measurable type with a computed outcome is 'classified' and carries the outcome's own labels", () => {
  const vm = buildOutcomeSummaryViewModel({ opportunityType: "IMPROVE_CTR", hasAction: true, outcome: SAMPLE_OUTCOME });
  assert.equal(vm.state, "classified");
  assert.equal(vm.label, "Improved");
  assert.equal(vm.tone, "success");
  assert.equal(vm.reasoning, SAMPLE_OUTCOME.classificationReasoning);
  assert.equal(vm.recommendationLabel, "Monitoring — no action needed");
  assert.equal(vm.measurementWindowDays, 28);
});

test("classified state never fabricates a causal claim — reasoning is passed through verbatim, not rewritten", () => {
  const vm = buildOutcomeSummaryViewModel({
    opportunityType: "OPTIMISE_EXISTING_PAGE",
    hasAction: true,
    outcome: { ...SAMPLE_OUTCOME, classification: "NEGATIVE", classificationReasoning: "Observed change following the action: clicks -22% (50 -> 39)." },
  });
  assert.equal(vm.state, "classified");
  assert.equal(vm.label, "Declined");
  assert.match(vm.reasoning ?? "", /Observed change following the action/);
  assert.doesNotMatch(vm.reasoning ?? "", /caused|because of this action|due to this change/i);
});

test("content-eligible and non-content measurable types resolve through the same precedence identically", () => {
  const contentVm = buildOutcomeSummaryViewModel({ opportunityType: "CREATE_NEW_PAGE", hasAction: false, outcome: null });
  const taskVm = buildOutcomeSummaryViewModel({ opportunityType: "INTERNAL_LINKING", hasAction: false, outcome: null });
  assert.equal(contentVm.state, taskVm.state);
  assert.equal(contentVm.label, taskVm.label);
});

test("every non-classified state has null reasoning, recommendationLabel, and measurementWindowDays", () => {
  for (const vm of [
    buildOutcomeSummaryViewModel({ opportunityType: "RESEARCH_REQUIRED", hasAction: false, outcome: null }),
    buildOutcomeSummaryViewModel({ opportunityType: "TECHNICAL_FIX", hasAction: false, outcome: null }),
    buildOutcomeSummaryViewModel({ opportunityType: "TECHNICAL_FIX", hasAction: true, outcome: null }),
  ]) {
    assert.equal(vm.reasoning, null);
    assert.equal(vm.recommendationLabel, null);
    assert.equal(vm.measurementWindowDays, null);
  }
});
