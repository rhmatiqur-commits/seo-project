import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveInvitationStatus } from "./businessos-invitation-status";

const ORG_ID = "org-real";
const NOW = new Date("2026-09-15T12:00:00Z");

test("returns the raw status for a pending, unexpired invitation", () => {
  const invitation = { status: "pending" as const, expires_at: "2026-09-30T00:00:00Z", organization_id: ORG_ID };
  assert.deepEqual(resolveInvitationStatus(invitation, ORG_ID, NOW), { ok: true, status: "pending" });
});

test("returns 'expired' for a pending invitation past its expires_at, reusing invitationDisplayStatus's live computation", () => {
  const invitation = { status: "pending" as const, expires_at: "2026-09-01T00:00:00Z", organization_id: ORG_ID };
  assert.deepEqual(resolveInvitationStatus(invitation, ORG_ID, NOW), { ok: true, status: "expired" });
});

test("returns 'accepted' as-is, ignoring expires_at (terminal status doesn't get re-evaluated for expiry)", () => {
  const invitation = { status: "accepted" as const, expires_at: "2026-09-01T00:00:00Z", organization_id: ORG_ID };
  assert.deepEqual(resolveInvitationStatus(invitation, ORG_ID, NOW), { ok: true, status: "accepted" });
});

test("returns 'revoked' as-is", () => {
  const invitation = { status: "revoked" as const, expires_at: "2026-09-30T00:00:00Z", organization_id: ORG_ID };
  assert.deepEqual(resolveInvitationStatus(invitation, ORG_ID, NOW), { ok: true, status: "revoked" });
});

test("returns not-ok when the invitation doesn't exist", () => {
  assert.deepEqual(resolveInvitationStatus(null, ORG_ID, NOW), { ok: false });
});

test("returns not-ok when the invitation belongs to a different organisation than claimed (IDOR guard)", () => {
  const invitation = { status: "pending" as const, expires_at: "2026-09-30T00:00:00Z", organization_id: "org-someone-else" };
  assert.deepEqual(resolveInvitationStatus(invitation, ORG_ID, NOW), { ok: false });
});
