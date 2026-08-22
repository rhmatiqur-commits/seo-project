import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveActionType, isMeasurableOpportunityType } from "./action-type";
import type { OpportunityType } from "@/lib/supabase/types";

test("deriveActionType: plain opportunity types map onto the equivalent seo_action_type", () => {
  assert.equal(deriveActionType("CREATE_NEW_PAGE", null), "CREATE_NEW_PAGE");
  assert.equal(deriveActionType("OPTIMISE_EXISTING_PAGE", null), "OPTIMISE_EXISTING_PAGE");
  assert.equal(deriveActionType("IMPROVE_CTR", null), "IMPROVE_CTR");
  assert.equal(deriveActionType("TECHNICAL_FIX", null), "TECHNICAL_FIX");
});

test("deriveActionType: a detector-sourced opportunity's detector type wins over the opportunity's own generic type (traceability)", () => {
  assert.equal(deriveActionType("CREATE_NEW_PAGE", "COMPETITOR_CONTENT_GAP"), "COMPETITOR_CONTENT_GAP");
  assert.equal(deriveActionType("OPTIMISE_EXISTING_PAGE", "COMPETITOR_RANKING_GAP"), "COMPETITOR_RANKING_GAP");
  assert.equal(deriveActionType("CREATE_NEW_PAGE", "CONTENT_GAP"), "CONTENT_GAP");
});

test("deriveActionType: a detector type outside the tracked subset is ignored, falls back to the opportunity type", () => {
  assert.equal(deriveActionType("CREATE_NEW_PAGE", "MISSING_PAGE"), "CREATE_NEW_PAGE");
});

test("deriveActionType: investigative opportunity types are not executable actions -> null", () => {
  assert.equal(deriveActionType("RESEARCH_REQUIRED", null), null);
  assert.equal(deriveActionType("INVESTIGATE_DECLINE", null), null);
  assert.equal(deriveActionType("INVESTIGATE_OPPORTUNITY", null), null);
});

test("isMeasurableOpportunityType: true for both content-eligible types", () => {
  assert.equal(isMeasurableOpportunityType("CREATE_NEW_PAGE"), true);
  assert.equal(isMeasurableOpportunityType("OPTIMISE_EXISTING_PAGE"), true);
});

test("isMeasurableOpportunityType: true for all 4 non-content action-mapped types", () => {
  assert.equal(isMeasurableOpportunityType("TECHNICAL_FIX"), true);
  assert.equal(isMeasurableOpportunityType("INTERNAL_LINKING"), true);
  assert.equal(isMeasurableOpportunityType("IMPROVE_INTERNAL_LINKING"), true);
  assert.equal(isMeasurableOpportunityType("IMPROVE_CTR"), true);
});

test("isMeasurableOpportunityType: false for all 3 investigative types", () => {
  assert.equal(isMeasurableOpportunityType("RESEARCH_REQUIRED"), false);
  assert.equal(isMeasurableOpportunityType("INVESTIGATE_DECLINE"), false);
  assert.equal(isMeasurableOpportunityType("INVESTIGATE_OPPORTUNITY"), false);
});

test("isMeasurableOpportunityType: every OpportunityType is classified one way or the other, exactly 6 measurable and 3 not", () => {
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
  const measurable = ALL_TYPES.filter(isMeasurableOpportunityType);
  assert.equal(measurable.length, 6);
  assert.equal(ALL_TYPES.length - measurable.length, 3);
});
