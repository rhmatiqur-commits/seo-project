import { test } from "node:test";
import assert from "node:assert/strict";
import { isContentApprovedForPublication } from "./eligibility";
import type { ContentPipelineStatus } from "@/lib/supabase/types";

test("only APPROVED is eligible for publication", () => {
  assert.equal(isContentApprovedForPublication("APPROVED"), true);
});

test("every other content_jobs status is ineligible", () => {
  const ineligible: ContentPipelineStatus[] = ["DRAFT", "QA_PENDING", "QA_FAILED", "NEEDS_REVIEW", "READY_FOR_APPROVAL", "REJECTED"];
  for (const status of ineligible) {
    assert.equal(isContentApprovedForPublication(status), false, `expected ${status} to be ineligible`);
  }
});
