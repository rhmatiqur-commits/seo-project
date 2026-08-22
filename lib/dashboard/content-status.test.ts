import { test } from "node:test";
import assert from "node:assert/strict";
import { attemptContextLabel, isAutomaticRetryInProgress, contentAttentionBucket, CONTENT_GENERATION_MAX_ATTEMPTS } from "./content-status";

test("CONTENT_GENERATION_MAX_ATTEMPTS is MAX_CONTENT_REVISIONS + 1 (first draft plus automatic revisions)", () => {
  assert.equal(CONTENT_GENERATION_MAX_ATTEMPTS, 3);
});

test("attemptContextLabel: attempts=0 (still on the first draft) reads as attempt 1", () => {
  assert.equal(attemptContextLabel(0), "Attempt 1 of 3");
});

test("attemptContextLabel: attempts=1 (one automatic revision already happened) reads as attempt 2", () => {
  assert.equal(attemptContextLabel(1), "Attempt 2 of 3");
});

test("attemptContextLabel: attempts=2 (at the automatic limit) reads as attempt 3", () => {
  assert.equal(attemptContextLabel(2), "Attempt 3 of 3");
});

test("attemptContextLabel never exceeds the max even if attempts somehow overshoots", () => {
  assert.equal(attemptContextLabel(5), "Attempt 3 of 3");
});

test("isAutomaticRetryInProgress: QA_FAILED with attempts under the limit means a retry is already chained", () => {
  assert.equal(isAutomaticRetryInProgress("QA_FAILED", 0), true);
  assert.equal(isAutomaticRetryInProgress("QA_FAILED", 1), true);
});

test("isAutomaticRetryInProgress: QA_FAILED at the automatic limit means no more retries will fire", () => {
  assert.equal(isAutomaticRetryInProgress("QA_FAILED", 2), false);
});

test("isAutomaticRetryInProgress: any other status is never 'automatic retry in progress'", () => {
  for (const status of ["DRAFT", "QA_PENDING", "NEEDS_REVIEW", "READY_FOR_APPROVAL", "APPROVED", "REJECTED"] as const) {
    assert.equal(isAutomaticRetryInProgress(status, 0), false, `${status} should never be an in-progress retry`);
  }
});

test("contentAttentionBucket: READY_FOR_APPROVAL and NEEDS_REVIEW need the client", () => {
  assert.equal(contentAttentionBucket("READY_FOR_APPROVAL"), "needs-you");
  assert.equal(contentAttentionBucket("NEEDS_REVIEW"), "needs-you");
});

test("contentAttentionBucket: APPROVED and REJECTED are done", () => {
  assert.equal(contentAttentionBucket("APPROVED"), "done");
  assert.equal(contentAttentionBucket("REJECTED"), "done");
});

test("contentAttentionBucket: DRAFT/QA_PENDING/QA_FAILED and no job at all are in-progress", () => {
  assert.equal(contentAttentionBucket("DRAFT"), "in-progress");
  assert.equal(contentAttentionBucket("QA_PENDING"), "in-progress");
  assert.equal(contentAttentionBucket("QA_FAILED"), "in-progress");
  assert.equal(contentAttentionBucket(null), "in-progress");
});

test("every ContentPipelineStatus value maps to exactly one bucket", () => {
  const statuses = ["DRAFT", "QA_PENDING", "QA_FAILED", "NEEDS_REVIEW", "READY_FOR_APPROVAL", "APPROVED", "REJECTED"] as const;
  for (const status of statuses) {
    const bucket = contentAttentionBucket(status);
    assert.ok(["needs-you", "in-progress", "done"].includes(bucket));
  }
});
