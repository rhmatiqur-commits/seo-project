import { test } from "node:test";
import assert from "node:assert/strict";
import {
  roleAtLeast,
  canManageUsers,
  canManageIntegrations,
  canManageOrganizationSettings,
  canApproveContent,
  canPreparePublication,
  canPublishToProduction,
  canManageSeoWork,
  canEditContent,
  canView,
} from "./permissions";

test("roleAtLeast: OWNER outranks every other role", () => {
  assert.equal(roleAtLeast("OWNER", "MANAGER"), true);
  assert.equal(roleAtLeast("OWNER", "EDITOR"), true);
  assert.equal(roleAtLeast("OWNER", "VIEWER"), true);
});

test("roleAtLeast: VIEWER does not meet a higher minimum", () => {
  assert.equal(roleAtLeast("VIEWER", "EDITOR"), false);
  assert.equal(roleAtLeast("VIEWER", "MANAGER"), false);
  assert.equal(roleAtLeast("VIEWER", "OWNER"), false);
});

test("roleAtLeast: a role always meets its own minimum", () => {
  for (const role of ["OWNER", "MANAGER", "EDITOR", "VIEWER"] as const) {
    assert.equal(roleAtLeast(role, role), true);
  }
});

test("roleAtLeast: a legacy Phase 1 role label (unused by app code, still a valid enum value) fails closed as the lowest rank", () => {
  assert.equal(roleAtLeast("owner", "VIEWER"), true); // still >= the lowest rank
  assert.equal(roleAtLeast("owner", "EDITOR"), false); // never treated as privileged
});

test("canManageUsers / canManageIntegrations / canManageOrganizationSettings: OWNER only", () => {
  for (const fn of [canManageUsers, canManageIntegrations, canManageOrganizationSettings]) {
    assert.equal(fn("OWNER"), true);
    assert.equal(fn("MANAGER"), false);
    assert.equal(fn("EDITOR"), false);
    assert.equal(fn("VIEWER"), false);
  }
});

test("canApproveContent / canPreparePublication / canPublishToProduction / canManageSeoWork: OWNER and MANAGER only", () => {
  for (const fn of [canApproveContent, canPreparePublication, canPublishToProduction, canManageSeoWork]) {
    assert.equal(fn("OWNER"), true);
    assert.equal(fn("MANAGER"), true);
    assert.equal(fn("EDITOR"), false);
    assert.equal(fn("VIEWER"), false);
  }
});

test("canPublishToProduction: EDITOR is excluded by default (no per-user override mechanism exists yet)", () => {
  assert.equal(canPublishToProduction("EDITOR"), false);
});

test("canEditContent: OWNER, MANAGER, and EDITOR, never VIEWER", () => {
  assert.equal(canEditContent("OWNER"), true);
  assert.equal(canEditContent("MANAGER"), true);
  assert.equal(canEditContent("EDITOR"), true);
  assert.equal(canEditContent("VIEWER"), false);
});

test("canView: every role, including VIEWER", () => {
  for (const role of ["OWNER", "MANAGER", "EDITOR", "VIEWER"] as const) {
    assert.equal(canView(role), true);
  }
});
