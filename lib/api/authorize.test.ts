import { test } from "node:test";
import assert from "node:assert/strict";
import { assertWebsiteBelongsToOrganization, OrganizationMismatchError } from "./authorize";

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
