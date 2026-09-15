import { test } from "node:test";
import assert from "node:assert/strict";
import { isAuthorizedBearer } from "./businessos-auth";

test("accepts the correct bearer token", () => {
  assert.equal(isAuthorizedBearer("Bearer correct-secret", "correct-secret"), true);
});

test("rejects a wrong bearer token", () => {
  assert.equal(isAuthorizedBearer("Bearer wrong-secret", "correct-secret"), false);
});

test("rejects a missing Authorization header", () => {
  assert.equal(isAuthorizedBearer(null, "correct-secret"), false);
});

test("rejects Basic auth instead of Bearer", () => {
  assert.equal(isAuthorizedBearer("Basic Y29ycmVjdC1zZWNyZXQ6", "correct-secret"), false);
});

test("fails closed when BUSINESSOS_INTEGRATION_SECRET isn't configured", () => {
  assert.equal(isAuthorizedBearer("Bearer anything", undefined), false);
});

test("rejects a header that is a prefix of the correct token (length-mismatch guard doesn't false-accept)", () => {
  assert.equal(isAuthorizedBearer("Bearer correct-", "correct-secret"), false);
});

test("rejects an empty header against an empty-string secret the same as any other mismatch", () => {
  // expectedSecret is falsy here too -- confirms this doesn't accidentally
  // treat "" as a configured, matchable secret.
  assert.equal(isAuthorizedBearer("", ""), false);
});
