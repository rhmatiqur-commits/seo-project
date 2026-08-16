import { test } from "node:test";
import assert from "node:assert/strict";
import { mapWordPressError } from "./errors";

test("null status (network/timeout) is retryable", () => {
  const err = mapWordPressError(null);
  assert.equal(err.kind, "NETWORK");
  assert.equal(err.retryable, true);
});

test("401/403 (invalid credentials) are permanent, never retried", () => {
  assert.equal(mapWordPressError(401).retryable, false);
  assert.equal(mapWordPressError(401).kind, "AUTH");
  assert.equal(mapWordPressError(403).retryable, false);
});

test("404 (target page not found) is permanent", () => {
  const err = mapWordPressError(404);
  assert.equal(err.kind, "NOT_FOUND");
  assert.equal(err.retryable, false);
});

test("409 (conflict) is permanent — needs human resolution, not an automatic retry", () => {
  const err = mapWordPressError(409);
  assert.equal(err.kind, "CONFLICT");
  assert.equal(err.retryable, false);
});

test("429 (rate limit) is retryable", () => {
  const err = mapWordPressError(429);
  assert.equal(err.kind, "RATE_LIMIT");
  assert.equal(err.retryable, true);
});

test("5xx (server error) is retryable", () => {
  assert.equal(mapWordPressError(500).retryable, true);
  assert.equal(mapWordPressError(503).retryable, true);
  assert.equal(mapWordPressError(500).kind, "SERVER_ERROR");
});

test("other 4xx (e.g. 400 bad request) is permanent by default", () => {
  const err = mapWordPressError(400);
  assert.equal(err.kind, "BAD_REQUEST");
  assert.equal(err.retryable, false);
});

test("detail text is included in the message when provided", () => {
  const err = mapWordPressError(401, "invalid_username");
  assert.match(err.message, /invalid_username/);
});
