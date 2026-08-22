import { test } from "node:test";
import assert from "node:assert/strict";
import { taskStatusLabel, taskStatusTone, allTaskStatuses, taskAttentionBucket, opportunityTaskStageInfo, OPPORTUNITY_TASK_STAGES } from "./task-status";
import type { TaskStatus } from "@/lib/supabase/types";

const ALL_STATUSES: TaskStatus[] = ["pending", "in_progress", "completed", "cancelled"];

test("every task status has a plain-English label with no underscores", () => {
  for (const status of ALL_STATUSES) {
    const label = taskStatusLabel(status);
    assert.ok(label.length > 0);
    assert.doesNotMatch(label, /_/);
    assert.doesNotMatch(label, /^[A-Z_]+$/);
  }
});

test("pending reads as an actionable 'To do', not the raw enum value", () => {
  assert.equal(taskStatusLabel("pending"), "To do");
});

test("status tones: completed reads positive, cancelled reads negative", () => {
  assert.equal(taskStatusTone("completed"), "success");
  assert.equal(taskStatusTone("cancelled"), "danger");
});

test("allTaskStatuses matches the full enum", () => {
  assert.deepEqual(allTaskStatuses().slice().sort(), ALL_STATUSES.slice().sort());
});

test("taskAttentionBucket: pending needs the client's attention", () => {
  assert.equal(taskAttentionBucket("pending"), "needs-you");
});

test("taskAttentionBucket: in_progress is its own bucket, not needs-you or done", () => {
  assert.equal(taskAttentionBucket("in_progress"), "in-progress");
});

test("taskAttentionBucket: completed and cancelled are both done", () => {
  assert.equal(taskAttentionBucket("completed"), "done");
  assert.equal(taskAttentionBucket("cancelled"), "done");
});

test("every TaskStatus maps to exactly one attention bucket", () => {
  for (const status of ALL_STATUSES) {
    const bucket = taskAttentionBucket(status);
    assert.ok(["needs-you", "in-progress", "done"].includes(bucket));
  }
});

test("OPPORTUNITY_TASK_STAGES has exactly the 3 named stages", () => {
  assert.deepEqual(OPPORTUNITY_TASK_STAGES, ["Accepted", "Task in progress", "Task completed"]);
});

test("opportunityTaskStageInfo: pending is stage 0 (Accepted), not cancelled", () => {
  const info = opportunityTaskStageInfo("pending");
  assert.equal(info.stageIndex, 0);
  assert.equal(info.cancelled, false);
});

test("opportunityTaskStageInfo: in_progress is stage 1", () => {
  const info = opportunityTaskStageInfo("in_progress");
  assert.equal(info.stageIndex, 1);
  assert.equal(info.cancelled, false);
});

test("opportunityTaskStageInfo: completed is stage 2, the final stage", () => {
  const info = opportunityTaskStageInfo("completed");
  assert.equal(info.stageIndex, 2);
  assert.equal(info.cancelled, false);
  assert.equal(info.stageIndex, OPPORTUNITY_TASK_STAGES.length - 1);
});

test("opportunityTaskStageInfo: cancelled is flagged distinctly, anchored at stage 0 rather than implying progress", () => {
  const info = opportunityTaskStageInfo("cancelled");
  assert.equal(info.cancelled, true);
  assert.equal(info.stageIndex, 0);
});

test("every TaskStatus produces a valid stageIndex within OPPORTUNITY_TASK_STAGES' range", () => {
  for (const status of ALL_STATUSES) {
    const info = opportunityTaskStageInfo(status);
    assert.ok(info.stageIndex >= 0 && info.stageIndex < OPPORTUNITY_TASK_STAGES.length);
  }
});
