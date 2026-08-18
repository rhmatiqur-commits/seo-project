import { test } from "node:test";
import assert from "node:assert/strict";
import { filterOpportunities, hasActiveFilters, DEFAULT_OPPORTUNITY_FILTERS, type OpportunityFilterState } from "./opportunity-filters";

const SAMPLE = [
  { id: "1", type: "CREATE_NEW_PAGE", status: "new", priority_score: 15, title: "Write a pricing page", description: "Competitors rank for pricing terms we don't cover." },
  { id: "2", type: "TECHNICAL_FIX", status: "new", priority_score: 6, title: "Fix broken canonical tags", description: "Several pages have mismatched canonicals." },
  { id: "3", type: "CREATE_NEW_PAGE", status: "approved", priority_score: 3, title: "Add a FAQ page", description: "Users search FAQ-style queries." },
  { id: "4", type: "IMPROVE_CTR", status: "rejected", priority_score: 8, title: "Rewrite meta descriptions", description: "Low CTR relative to position." },
];

function withFilters(overrides: Partial<OpportunityFilterState>): OpportunityFilterState {
  return { ...DEFAULT_OPPORTUNITY_FILTERS, ...overrides };
}

test("no filters returns everything unchanged", () => {
  const result = filterOpportunities(SAMPLE, DEFAULT_OPPORTUNITY_FILTERS);
  assert.equal(result.length, 4);
});

test("filters by exact type", () => {
  const result = filterOpportunities(SAMPLE, withFilters({ type: "CREATE_NEW_PAGE" }));
  assert.deepEqual(result.map((o) => o.id), ["1", "3"]);
});

test("filters by impact tier derived from priority_score, not a stored field", () => {
  const result = filterOpportunities(SAMPLE, withFilters({ impact: "high" }));
  assert.deepEqual(result.map((o) => o.id), ["1"]);
});

test("filters by status", () => {
  const result = filterOpportunities(SAMPLE, withFilters({ status: "rejected" }));
  assert.deepEqual(result.map((o) => o.id), ["4"]);
});

test("search matches title case-insensitively", () => {
  const result = filterOpportunities(SAMPLE, withFilters({ search: "PRICING" }));
  assert.deepEqual(result.map((o) => o.id), ["1"]);
});

test("search matches description, not just title", () => {
  const result = filterOpportunities(SAMPLE, withFilters({ search: "canonical" }));
  assert.deepEqual(result.map((o) => o.id), ["2"]);
});

test("search only matches title/description — a term that appears nowhere in either finds nothing", () => {
  // FilterableOpportunity intentionally has no `rationale` field, so a
  // caller can't accidentally pass rationale text through as searchable.
  const result = filterOpportunities(SAMPLE, withFilters({ search: "zzz-not-present-anywhere" }));
  assert.equal(result.length, 0);
});

test("filters combine with AND semantics", () => {
  const result = filterOpportunities(SAMPLE, withFilters({ type: "CREATE_NEW_PAGE", status: "approved" }));
  assert.deepEqual(result.map((o) => o.id), ["3"]);
});

test("hasActiveFilters is false only for the untouched default state", () => {
  assert.equal(hasActiveFilters(DEFAULT_OPPORTUNITY_FILTERS), false);
  assert.equal(hasActiveFilters(withFilters({ search: "x" })), true);
  assert.equal(hasActiveFilters(withFilters({ type: "TECHNICAL_FIX" })), true);
});
