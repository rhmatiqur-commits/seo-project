import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldCreateFollowUpTask } from "./follow-up";

test("shouldCreateFollowUpTask: task-worthy recommendation, autonomy allows it, not already done -> true", () => {
  assert.equal(shouldCreateFollowUpTask({ recommendation: "DIAGNOSE_DECLINE", autonomyAllowsRecommendations: true, existingFollowUpTaskId: null }), true);
  assert.equal(shouldCreateFollowUpTask({ recommendation: "INVESTIGATE_CTR", autonomyAllowsRecommendations: true, existingFollowUpTaskId: null }), true);
});

test("shouldCreateFollowUpTask: MONITOR never creates a task (avoid changing a successful page unnecessarily)", () => {
  assert.equal(shouldCreateFollowUpTask({ recommendation: "MONITOR", autonomyAllowsRecommendations: true, existingFollowUpTaskId: null }), false);
});

test("shouldCreateFollowUpTask: WAIT_FOR_MORE_DATA never creates a task (do not modify the page on insufficient data)", () => {
  assert.equal(shouldCreateFollowUpTask({ recommendation: "WAIT_FOR_MORE_DATA", autonomyAllowsRecommendations: true, existingFollowUpTaskId: null }), false);
});

test("shouldCreateFollowUpTask: a follow-up task already exists for this outcome -> false (duplicate-task prevention)", () => {
  assert.equal(shouldCreateFollowUpTask({ recommendation: "DIAGNOSE_DECLINE", autonomyAllowsRecommendations: true, existingFollowUpTaskId: "task-1" }), false);
});

test("shouldCreateFollowUpTask: MANUAL autonomy blocks every recommendation, task-worthy or not", () => {
  assert.equal(shouldCreateFollowUpTask({ recommendation: "DIAGNOSE_DECLINE", autonomyAllowsRecommendations: false, existingFollowUpTaskId: null }), false);
});
