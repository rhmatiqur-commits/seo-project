import { test } from "node:test";
import assert from "node:assert/strict";
import { signState, verifyState } from "./state";

const SECRET = "test-client-secret";
const PAYLOAD = { websiteId: "11111111-1111-1111-1111-111111111111", organizationId: "22222222-2222-2222-2222-222222222222" };

test("verifyState roundtrips a validly-signed, unexpired token", () => {
  const token = signState(PAYLOAD, SECRET, 10 * 60 * 1000, 1_000_000);
  const result = verifyState(token, SECRET, 1_000_000 + 1000);
  assert.deepEqual(result, PAYLOAD);
});

test("verifyState rejects a tampered payload", () => {
  const token = signState(PAYLOAD, SECRET, 10 * 60 * 1000, 1_000_000);
  const [body, signature] = token.split(".");
  const tamperedBody = Buffer.from(JSON.stringify({ ...PAYLOAD, websiteId: "attacker-controlled-id", exp: 2_000_000 }), "utf8").toString(
    "base64url"
  );
  const tamperedToken = `${tamperedBody}.${signature}`;
  assert.equal(verifyState(tamperedToken, SECRET, 1_000_000 + 1000), null);
  assert.ok(body); // sanity: original body isn't reused above, avoids an unused-var lint
});

test("verifyState rejects a token signed with a different secret", () => {
  const token = signState(PAYLOAD, "some-other-secret", 10 * 60 * 1000, 1_000_000);
  assert.equal(verifyState(token, SECRET, 1_000_000 + 1000), null);
});

test("verifyState rejects an expired token", () => {
  const token = signState(PAYLOAD, SECRET, 10 * 60 * 1000, 1_000_000);
  const justAfterExpiry = 1_000_000 + 10 * 60 * 1000 + 1;
  assert.equal(verifyState(token, SECRET, justAfterExpiry), null);
});

test("verifyState rejects malformed tokens", () => {
  assert.equal(verifyState("not-a-valid-token", SECRET), null);
  assert.equal(verifyState("", SECRET), null);
  assert.equal(verifyState("a.b.c", SECRET), null);
});

test("Phase 7.2C-B: a token signed without dashboardOrgSlug round-trips without it (admin-initiated flow, unchanged)", () => {
  const token = signState(PAYLOAD, SECRET, 10 * 60 * 1000, 1_000_000);
  const result = verifyState(token, SECRET, 1_000_000 + 1000);
  assert.deepEqual(result, PAYLOAD);
  assert.equal(Object.hasOwn(result ?? {}, "dashboardOrgSlug"), false);
});

test("Phase 7.2C-B: a token signed with dashboardOrgSlug carries it through unchanged (dashboard-initiated flow)", () => {
  const withOrgSlug = { ...PAYLOAD, dashboardOrgSlug: "cv-central" };
  const token = signState(withOrgSlug, SECRET, 10 * 60 * 1000, 1_000_000);
  const result = verifyState(token, SECRET, 1_000_000 + 1000);
  assert.deepEqual(result, withOrgSlug);
});

test("Phase 7.2C-B: a tampered dashboardOrgSlug (attacker tries to redirect a different org) is rejected by the signature check", () => {
  const token = signState({ ...PAYLOAD, dashboardOrgSlug: "cv-central" }, SECRET, 10 * 60 * 1000, 1_000_000);
  const [, signature] = token.split(".");
  const tamperedBody = Buffer.from(JSON.stringify({ ...PAYLOAD, dashboardOrgSlug: "attacker-org", exp: 2_000_000 }), "utf8").toString("base64url");
  assert.equal(verifyState(`${tamperedBody}.${signature}`, SECRET, 1_000_000 + 1000), null);
});
