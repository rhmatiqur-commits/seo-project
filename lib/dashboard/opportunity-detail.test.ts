import { test } from "node:test";
import assert from "node:assert/strict";
import { buildOpportunityCardViewModel, buildOpportunityDetailViewModel, type OpportunitySourceRow } from "./opportunity-detail";

function baseOpportunity(overrides: Partial<OpportunitySourceRow> = {}): OpportunitySourceRow {
  return {
    id: "opp-1",
    title: "Create a comparison page",
    description: "No page currently targets 'X vs Y' queries.",
    rationale: "Search volume for comparison queries is high and none of our pages rank.",
    type: "CREATE_NEW_PAGE",
    status: "new",
    priority_score: 12,
    target_page_id: null,
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

test("card view model derives client-safe labels and a truncated rationale teaser", () => {
  const vm = buildOpportunityCardViewModel(baseOpportunity(), null);
  assert.equal(vm.typeLabel, "Create a new page");
  assert.equal(vm.impactLabel, "High impact");
  assert.equal(vm.statusLabel, "New opportunity");
  assert.equal(vm.affectedPageUrl, null);
  assert.ok(vm.rationaleTeaser.length <= baseOpportunity().rationale.length);
});

test("card view model resolves the affected page URL when a page is supplied", () => {
  const vm = buildOpportunityCardViewModel(baseOpportunity({ target_page_id: "page-1" }), { url: "https://example.com/vs" });
  assert.equal(vm.affectedPageUrl, "https://example.com/vs");
});

test("detail view model includes the full, untruncated rationale", () => {
  const opp = baseOpportunity();
  const vm = buildOpportunityDetailViewModel(opp, null, null);
  assert.equal(vm.rationale, opp.rationale);
});

test("detail view model surfaces detector reasoning when a detector row exists", () => {
  const vm = buildOpportunityDetailViewModel(baseOpportunity(), { reasoning: "Page fell from position 4 to position 14 in the last 28 days." }, null);
  assert.equal(vm.detectorExplanation, "Page fell from position 4 to position 14 in the last 28 days.");
});

test("detail view model does not invent detector reasoning for AI-only opportunities", () => {
  const vm = buildOpportunityDetailViewModel(baseOpportunity(), null, null);
  assert.equal(vm.detectorExplanation, null);
});

test("detail view model treats a blank detector reasoning string the same as no detector row", () => {
  const vm = buildOpportunityDetailViewModel(baseOpportunity(), { reasoning: "   " }, null);
  assert.equal(vm.detectorExplanation, null);
});

test("content eligibility passes through the real gate — CREATE_NEW_PAGE/OPTIMISE_EXISTING_PAGE only", () => {
  assert.equal(buildOpportunityDetailViewModel(baseOpportunity({ type: "CREATE_NEW_PAGE" }), null, null).contentEligible, true);
  assert.equal(buildOpportunityDetailViewModel(baseOpportunity({ type: "OPTIMISE_EXISTING_PAGE" }), null, null).contentEligible, true);
  assert.equal(buildOpportunityDetailViewModel(baseOpportunity({ type: "TECHNICAL_FIX" }), null, null).contentEligible, false);
  assert.equal(buildOpportunityDetailViewModel(baseOpportunity({ type: "INTERNAL_LINKING" }), null, null).contentEligible, false);
});

test("detail view model resolves affected page URL when present", () => {
  const vm = buildOpportunityDetailViewModel(baseOpportunity({ target_page_id: "page-9" }), null, { url: "https://example.com/x" });
  assert.equal(vm.affectedPageUrl, "https://example.com/x");
});
