import { test } from "node:test";
import assert from "node:assert/strict";
import { decidePublishAction } from "./retry-strategy";

test("first attempt with no known external_id and nothing found by slug: create new", () => {
  assert.equal(decidePublishAction({ existingExternalId: null, retryCount: 0, foundExistingBySlug: null }), "CREATE_NEW");
});

test("a known external_id from a prior successful attempt always wins, regardless of retry count", () => {
  assert.equal(decidePublishAction({ existingExternalId: "123", retryCount: 0, foundExistingBySlug: null }), "USE_EXISTING");
  assert.equal(decidePublishAction({ existingExternalId: "123", retryCount: 2, foundExistingBySlug: { externalId: "456" } }), "USE_EXISTING");
});

test("a retry with no known external_id but a page found at the target slug: adopt it instead of creating a duplicate", () => {
  assert.equal(decidePublishAction({ existingExternalId: null, retryCount: 1, foundExistingBySlug: { externalId: "789" } }), "ADOPT_FOUND");
});

test("a retry that finds nothing at the slug: safe to create new (the first attempt genuinely never reached WordPress)", () => {
  assert.equal(decidePublishAction({ existingExternalId: null, retryCount: 1, foundExistingBySlug: null }), "CREATE_NEW");
});

test("the slug lookup is never consulted on a genuine first attempt (retryCount 0), even if it were somehow populated", () => {
  assert.equal(decidePublishAction({ existingExternalId: null, retryCount: 0, foundExistingBySlug: { externalId: "999" } }), "CREATE_NEW");
});
