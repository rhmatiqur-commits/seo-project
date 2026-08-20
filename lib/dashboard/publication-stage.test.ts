import { test } from "node:test";
import assert from "node:assert/strict";
import { getPublicationStageInfo, PUBLICATION_STAGES } from "./publication-stage";
import type { PublicationStatus } from "@/lib/supabase/types";

test("PUBLICATION_STAGES has exactly 5 stages, Draft through Live", () => {
  assert.deepEqual(PUBLICATION_STAGES, ["Draft", "Preparing changes", "Preview ready", "Ready to publish", "Live"]);
});

test("no stage label collides with the content-approval word 'Approved' (7.1E fix)", () => {
  assert.ok(!PUBLICATION_STAGES.includes("Approved" as (typeof PUBLICATION_STAGES)[number]));
});

test("PENDING is stage 0 (Draft), not failed", () => {
  const info = getPublicationStageInfo("PENDING");
  assert.equal(info.stageIndex, 0);
  assert.equal(info.failed, false);
});

test("the GitHub branch/commit/PR trio all map to stage 1 (Preparing changes)", () => {
  for (const status of ["BRANCH_CREATED", "COMMITTED", "PR_CREATED"] as PublicationStatus[]) {
    assert.equal(getPublicationStageInfo(status).stageIndex, 1, `${status} should be stage 1`);
  }
});

test("PREVIEW_READY, DRAFTED and AWAITING_PRODUCTION_APPROVAL all map to stage 2 (Preview ready)", () => {
  for (const status of ["PREVIEW_READY", "DRAFTED", "AWAITING_PRODUCTION_APPROVAL"] as PublicationStatus[]) {
    assert.equal(getPublicationStageInfo(status).stageIndex, 2, `${status} should be stage 2`);
  }
});

test("MERGING is stage 3 (Ready to publish)", () => {
  assert.equal(getPublicationStageInfo("MERGING").stageIndex, 3);
});

test("DEPLOYING, PUBLISHING and PUBLISHED all map to stage 4 (Live)", () => {
  for (const status of ["DEPLOYING", "PUBLISHING", "PUBLISHED"] as PublicationStatus[]) {
    assert.equal(getPublicationStageInfo(status).stageIndex, 4, `${status} should be stage 4`);
  }
});

test("PUBLISHED is not marked failed", () => {
  assert.equal(getPublicationStageInfo("PUBLISHED").failed, false);
});

test("FAILED is failed, anchored at stage 0 since the actual failure point isn't recoverable from status alone", () => {
  const info = getPublicationStageInfo("FAILED");
  assert.equal(info.failed, true);
  assert.equal(info.stageIndex, 0);
});

test("UNPUBLISHED is failed (reverted), anchored at stage 4 since it can only occur after PUBLISHED", () => {
  const info = getPublicationStageInfo("UNPUBLISHED");
  assert.equal(info.failed, true);
  assert.equal(info.stageIndex, 4);
});

test("every PublicationStatus value has a mapping (no silent undefined stage)", () => {
  const allStatuses: PublicationStatus[] = [
    "PENDING",
    "PUBLISHING",
    "DRAFTED",
    "PUBLISHED",
    "FAILED",
    "UNPUBLISHED",
    "BRANCH_CREATED",
    "COMMITTED",
    "PR_CREATED",
    "PREVIEW_READY",
    "AWAITING_PRODUCTION_APPROVAL",
    "MERGING",
    "DEPLOYING",
  ];
  for (const status of allStatuses) {
    const info = getPublicationStageInfo(status);
    assert.ok(Number.isInteger(info.stageIndex), `${status} should have an integer stageIndex`);
    assert.ok(info.stageIndex >= 0 && info.stageIndex < PUBLICATION_STAGES.length, `${status} stageIndex should be in range`);
  }
});
