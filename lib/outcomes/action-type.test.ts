import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveActionType } from "./action-type";

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
