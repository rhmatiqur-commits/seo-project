import { test } from "node:test";
import assert from "node:assert/strict";
import { autonomyAllowsAutomaticContentChange, autonomyAllowsRecommendations } from "./autonomy";

test("autonomyAllowsAutomaticContentChange: always false in Phase 6, for every level (fails closed)", () => {
  for (const level of ["MANUAL", "AI_RECOMMENDS", "AI_PREPARES", "AI_EXECUTES"] as const) {
    assert.equal(autonomyAllowsAutomaticContentChange(level), false);
  }
});

test("autonomyAllowsRecommendations: MANUAL disables even passive recommendations", () => {
  assert.equal(autonomyAllowsRecommendations("MANUAL"), false);
});

test("autonomyAllowsRecommendations: AI_RECOMMENDS (the default) and higher levels allow recommendations", () => {
  assert.equal(autonomyAllowsRecommendations("AI_RECOMMENDS"), true);
  assert.equal(autonomyAllowsRecommendations("AI_PREPARES"), true);
  assert.equal(autonomyAllowsRecommendations("AI_EXECUTES"), true);
});
