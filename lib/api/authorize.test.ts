import { test } from "node:test";
import assert from "node:assert/strict";
import { assertWebsiteBelongsToOrganization, assertOwnedByOrganization, OrganizationMismatchError } from "./authorize";

const WEBSITE = { organization_id: "org-real" };

test("returns the website's real organization_id when no expected id is supplied", () => {
  assert.equal(assertWebsiteBelongsToOrganization(WEBSITE, undefined, "site-1"), "org-real");
});

test("returns the real organization_id when the supplied id matches (website ownership check)", () => {
  assert.equal(assertWebsiteBelongsToOrganization(WEBSITE, "org-real", "site-1"), "org-real");
});

test("throws when a caller-supplied organization_id doesn't match the website's real owner (organisation isolation)", () => {
  assert.throws(() => assertWebsiteBelongsToOrganization(WEBSITE, "org-attacker", "site-1"), OrganizationMismatchError);
});

test("throws when the website doesn't exist at all", () => {
  assert.throws(() => assertWebsiteBelongsToOrganization(null, "org-real", "site-missing"), OrganizationMismatchError);
});

// --- assertOwnedByOrganization (Phase 4 generalisation) ---

const CONTENT_BRIEF = { organization_id: "org-real" };

test("assertOwnedByOrganization: returns the resource's real organization_id when no expected id is supplied", () => {
  assert.equal(assertOwnedByOrganization(CONTENT_BRIEF, undefined, "ContentBrief", "brief-1"), "org-real");
});

test("assertOwnedByOrganization: returns the real organization_id when the supplied id matches", () => {
  assert.equal(assertOwnedByOrganization(CONTENT_BRIEF, "org-real", "ContentBrief", "brief-1"), "org-real");
});

test("assertOwnedByOrganization: throws (organisation isolation) when a caller-supplied organization_id doesn't match the resource's real owner", () => {
  assert.throws(() => assertOwnedByOrganization(CONTENT_BRIEF, "org-attacker", "ContentBrief", "brief-1"), OrganizationMismatchError);
});

test("assertOwnedByOrganization: throws when the resource doesn't exist at all", () => {
  assert.throws(() => assertOwnedByOrganization(null, "org-real", "ContentBrief", "brief-missing"), OrganizationMismatchError);
});

test("assertOwnedByOrganization: error message includes the resource type", () => {
  try {
    assertOwnedByOrganization(null, "org-real", "ContentBrief", "brief-missing");
    assert.fail("expected to throw");
  } catch (error) {
    assert.match((error as Error).message, /ContentBrief brief-missing/);
  }
});
