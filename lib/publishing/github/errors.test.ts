import { test } from "node:test";
import assert from "node:assert/strict";
import { mapGitHubError, isAlreadyExistsError, GitHubApiError } from "./errors";

test("null status (network/timeout) is retryable", () => {
  const error = mapGitHubError(null, undefined, false);
  assert.equal(error.retryable, true);
  assert.equal(error.kind, "NETWORK");
});

test("401 is AUTH, never retried", () => {
  const error = mapGitHubError(401, "Bad credentials", false);
  assert.equal(error.kind, "AUTH");
  assert.equal(error.retryable, false);
});

test("403 without a rate-limit signal is AUTH (permission denied), not rate-limit", () => {
  const error = mapGitHubError(403, "Resource not accessible by personal access token", false);
  assert.equal(error.kind, "AUTH");
  assert.equal(error.retryable, false);
});

test("403 WITH a rate-limit signal is RATE_LIMIT, retryable — GitHub overloads 403 for both cases", () => {
  const error = mapGitHubError(403, "API rate limit exceeded", true);
  assert.equal(error.kind, "RATE_LIMIT");
  assert.equal(error.retryable, true);
});

test("404 is NOT_FOUND, permanent", () => {
  const error = mapGitHubError(404, undefined, false);
  assert.equal(error.kind, "NOT_FOUND");
  assert.equal(error.retryable, false);
});

test("405 (blocked merge) is CONFLICT, permanent — needs human resolution, not a retry", () => {
  const error = mapGitHubError(405, "Pull Request is not mergeable", false);
  assert.equal(error.kind, "CONFLICT");
  assert.equal(error.retryable, false);
});

test("409 is CONFLICT, permanent", () => {
  const error = mapGitHubError(409, undefined, false);
  assert.equal(error.kind, "CONFLICT");
  assert.equal(error.retryable, false);
});

test("422 (e.g. ref already exists) is VALIDATION, permanent", () => {
  const error = mapGitHubError(422, "Reference already exists", false);
  assert.equal(error.kind, "VALIDATION");
  assert.equal(error.retryable, false);
});

test("429 is RATE_LIMIT, retryable", () => {
  const error = mapGitHubError(429, undefined, false);
  assert.equal(error.kind, "RATE_LIMIT");
  assert.equal(error.retryable, true);
});

test("5xx is SERVER_ERROR, retryable", () => {
  const error = mapGitHubError(502, undefined, false);
  assert.equal(error.kind, "SERVER_ERROR");
  assert.equal(error.retryable, true);
});

test("detail text is included in the message when provided", () => {
  const error = mapGitHubError(422, "Reference already exists", false);
  assert.match(error.message, /Reference already exists/);
});

test("isAlreadyExistsError: true for a 422 'already exists' validation error", () => {
  const error = mapGitHubError(422, "Reference already exists", false);
  assert.equal(isAlreadyExistsError(error), true);
});

test("isAlreadyExistsError: false for an unrelated validation error", () => {
  const error = mapGitHubError(422, "Invalid field 'title'", false);
  assert.equal(isAlreadyExistsError(error), false);
});

test("isAlreadyExistsError: false for a non-GitHubApiError value", () => {
  assert.equal(isAlreadyExistsError(new Error("Reference already exists")), false);
});

test("GitHubApiError carries the original httpStatus for callers that need it", () => {
  const error = mapGitHubError(404, undefined, false);
  assert.ok(error instanceof GitHubApiError);
  assert.equal(error.httpStatus, 404);
});
