import { test } from "node:test";
import assert from "node:assert/strict";
import { contentStatusLabel, publicationStatusLabel } from "./status-labels";
import type { ContentPipelineStatus, PublicationStatus } from "@/lib/supabase/types";

const ALL_CONTENT_STATUSES: ContentPipelineStatus[] = ["DRAFT", "QA_PENDING", "QA_FAILED", "NEEDS_REVIEW", "READY_FOR_APPROVAL", "APPROVED", "REJECTED"];

const ALL_PUBLICATION_STATUSES: PublicationStatus[] = [
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

test("every content pipeline status has a plain-English label with no underscores", () => {
  for (const status of ALL_CONTENT_STATUSES) {
    const label = contentStatusLabel(status);
    assert.ok(label.length > 0, `${status} should have a non-empty label`);
    assert.doesNotMatch(label, /_/, `${status}'s label should not contain a raw underscore`);
    assert.doesNotMatch(label, /^[A-Z_]+$/, `${status}'s label should not be the shouting-case raw enum value`);
  }
});

test("READY_FOR_APPROVAL reads as an instruction to the client, not a raw state name", () => {
  assert.equal(contentStatusLabel("READY_FOR_APPROVAL"), "Ready for your approval");
});

test("every publication status has a plain-English label with no underscores", () => {
  for (const status of ALL_PUBLICATION_STATUSES) {
    const label = publicationStatusLabel(status);
    assert.ok(label.length > 0, `${status} should have a non-empty label`);
    assert.doesNotMatch(label, /_/, `${status}'s label should not contain a raw underscore`);
  }
});

test("PUBLISHED reads as 'Live', not the raw enum value", () => {
  assert.equal(publicationStatusLabel("PUBLISHED"), "Live");
});

test("distinct GitHub-flow statuses that all mean 'still assembling the change' collapse to the same honest label", () => {
  assert.equal(publicationStatusLabel("BRANCH_CREATED"), publicationStatusLabel("COMMITTED"));
});
