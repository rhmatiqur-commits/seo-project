import { test } from "node:test";
import assert from "node:assert/strict";
import { buildInviteAcceptUrl, invitationDisplayStatus } from "./invitations";

test("buildInviteAcceptUrl produces the exact URL shape accept-invite/page.tsx expects", () => {
  assert.equal(
    buildInviteAcceptUrl("https://app.example.com", "abc-123"),
    "https://app.example.com/dashboard/accept-invite?token=abc-123"
  );
});

test("buildInviteAcceptUrl does not alter or encode the token — it's already a URL-safe uuid", () => {
  const token = "11111111-2222-3333-4444-555555555555";
  assert.ok(buildInviteAcceptUrl("https://app.example.com", token).endsWith(`token=${token}`));
});

test("buildInviteAcceptUrl works with a bare localhost origin (no trailing slash assumed)", () => {
  assert.equal(buildInviteAcceptUrl("http://localhost:3000", "tok"), "http://localhost:3000/dashboard/accept-invite?token=tok");
});

test("Phase 7.2C-C: a pending invitation not yet expired reads as 'pending'", () => {
  const now = new Date("2026-01-15T00:00:00Z");
  const invitation = { status: "pending" as const, expires_at: "2026-01-20T00:00:00Z" };
  assert.equal(invitationDisplayStatus(invitation, now), "pending");
});

test("Phase 7.2C-C: a pending invitation past its expires_at reads as 'expired', display-only", () => {
  const now = new Date("2026-01-25T00:00:00Z");
  const invitation = { status: "pending" as const, expires_at: "2026-01-20T00:00:00Z" };
  assert.equal(invitationDisplayStatus(invitation, now), "expired");
});

test("Phase 7.2C-C: exactly at the expiry instant is not yet expired (strict less-than, matches accept-invite/page.tsx's own check)", () => {
  const at = new Date("2026-01-20T00:00:00Z");
  const invitation = { status: "pending" as const, expires_at: "2026-01-20T00:00:00Z" };
  assert.equal(invitationDisplayStatus(invitation, at), "pending");
});

test("Phase 7.2C-C: accepted/revoked pass through unchanged regardless of expires_at", () => {
  const longPast = new Date("2030-01-01T00:00:00Z");
  assert.equal(invitationDisplayStatus({ status: "accepted", expires_at: "2026-01-01T00:00:00Z" }, longPast), "accepted");
  assert.equal(invitationDisplayStatus({ status: "revoked", expires_at: "2026-01-01T00:00:00Z" }, longPast), "revoked");
});
