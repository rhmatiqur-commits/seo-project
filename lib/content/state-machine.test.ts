import { test } from "node:test";
import assert from "node:assert/strict";
import { canTransitionContentJob, isTerminalContentStatus, availableContentActions } from "./state-machine";

test("DRAFT can only move to QA_PENDING", () => {
  assert.equal(canTransitionContentJob("DRAFT", "QA_PENDING"), true);
  assert.equal(canTransitionContentJob("DRAFT", "APPROVED"), false);
  assert.equal(canTransitionContentJob("DRAFT", "REJECTED"), false);
});

test("QA_PENDING can resolve to READY_FOR_APPROVAL, QA_FAILED, or NEEDS_REVIEW", () => {
  assert.equal(canTransitionContentJob("QA_PENDING", "READY_FOR_APPROVAL"), true);
  assert.equal(canTransitionContentJob("QA_PENDING", "QA_FAILED"), true);
  assert.equal(canTransitionContentJob("QA_PENDING", "NEEDS_REVIEW"), true);
  assert.equal(canTransitionContentJob("QA_PENDING", "APPROVED"), false);
});

test("READY_FOR_APPROVAL supports Approve, Reject, and a manual Revise", () => {
  assert.equal(canTransitionContentJob("READY_FOR_APPROVAL", "APPROVED"), true);
  assert.equal(canTransitionContentJob("READY_FOR_APPROVAL", "REJECTED"), true);
  assert.equal(canTransitionContentJob("READY_FOR_APPROVAL", "QA_PENDING"), true);
});

test("NEEDS_REVIEW allows a human override to APPROVED/REJECTED, or a manual revise", () => {
  assert.equal(canTransitionContentJob("NEEDS_REVIEW", "APPROVED"), true);
  assert.equal(canTransitionContentJob("NEEDS_REVIEW", "REJECTED"), true);
  assert.equal(canTransitionContentJob("NEEDS_REVIEW", "QA_PENDING"), true);
});

test("QA_FAILED allows automatic/manual revise or reject, never a direct approve", () => {
  assert.equal(canTransitionContentJob("QA_FAILED", "QA_PENDING"), true);
  assert.equal(canTransitionContentJob("QA_FAILED", "REJECTED"), true);
  assert.equal(canTransitionContentJob("QA_FAILED", "APPROVED"), false);
});

test("APPROVED and REJECTED are terminal — nothing transitions out", () => {
  assert.equal(isTerminalContentStatus("APPROVED"), true);
  assert.equal(isTerminalContentStatus("REJECTED"), true);
  assert.equal(canTransitionContentJob("APPROVED", "REJECTED"), false);
  assert.equal(canTransitionContentJob("REJECTED", "APPROVED"), false);
  assert.equal(canTransitionContentJob("APPROVED", "QA_PENDING"), false);
});

test("availableContentActions reflects the transition graph for the admin UI's buttons", () => {
  assert.deepEqual(availableContentActions("DRAFT"), { canApprove: false, canReject: false, canRevise: false });
  assert.deepEqual(availableContentActions("READY_FOR_APPROVAL"), { canApprove: true, canReject: true, canRevise: true });
  assert.deepEqual(availableContentActions("APPROVED"), { canApprove: false, canReject: false, canRevise: false });
  assert.deepEqual(availableContentActions("NEEDS_REVIEW"), { canApprove: true, canReject: true, canRevise: true });
});
