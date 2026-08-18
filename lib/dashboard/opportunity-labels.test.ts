import { test } from "node:test";
import assert from "node:assert/strict";
import {
  opportunityTypeLabel,
  opportunityStatusLabel,
  opportunityStatusTone,
  allOpportunityTypes,
  allOpportunityStatuses,
} from "./opportunity-labels";
import type { OpportunityStatus, OpportunityType } from "@/lib/supabase/types";

const ALL_TYPES: OpportunityType[] = [
  "CREATE_NEW_PAGE",
  "OPTIMISE_EXISTING_PAGE",
  "TECHNICAL_FIX",
  "INTERNAL_LINKING",
  "RESEARCH_REQUIRED",
  "IMPROVE_CTR",
  "INVESTIGATE_DECLINE",
  "INVESTIGATE_OPPORTUNITY",
  "IMPROVE_INTERNAL_LINKING",
];

const ALL_STATUSES: OpportunityStatus[] = ["new", "approved", "rejected", "done"];

test("every opportunity type has a client-safe, non-shouting-case label", () => {
  for (const type of ALL_TYPES) {
    const label = opportunityTypeLabel(type);
    assert.ok(label.length > 0);
    assert.notEqual(label, type, `${type} should not fall back to the raw enum value`);
    assert.doesNotMatch(label, /^[A-Z_]+$/);
  }
});

test("allOpportunityTypes matches the full enum (stays in sync if a type is ever added)", () => {
  assert.deepEqual(allOpportunityTypes().slice().sort(), ALL_TYPES.slice().sort());
});

test("status labels use client decision language, not backend verbs", () => {
  assert.equal(opportunityStatusLabel("new"), "New opportunity");
  assert.equal(opportunityStatusLabel("approved"), "Accepted");
  assert.equal(opportunityStatusLabel("rejected"), "Dismissed");
  assert.equal(opportunityStatusLabel("done"), "Completed");
});

test("status labels never contain the raw 'approved'/'rejected' backend words", () => {
  for (const status of ALL_STATUSES) {
    const label = opportunityStatusLabel(status);
    assert.doesNotMatch(label.toLowerCase(), /approved|rejected/);
  }
});

test("status tones: accepted/completed read positive, dismissed reads as a quiet negative", () => {
  assert.equal(opportunityStatusTone("approved"), "success");
  assert.equal(opportunityStatusTone("done"), "success");
  assert.equal(opportunityStatusTone("rejected"), "danger");
});

test("allOpportunityStatuses matches the full enum", () => {
  assert.deepEqual(allOpportunityStatuses().slice().sort(), ALL_STATUSES.slice().sort());
});
