/**
 * Pure GitHub REST API error classification — zero network, zero
 * @/lib/env dependency, unit-testable standalone. Mirrors
 * lib/publishing/errors.ts's mapWordPressError shape exactly (kind/
 * retryable/httpStatus), adapted to GitHub's actual status-code behaviour,
 * which differs from WordPress's in a few important ways:
 *
 *  - GitHub returns 403 for BOTH bad credentials and rate-limiting — the
 *    caller must pass `rateLimited` (derived from response headers/body,
 *    see lib/publishing/github/client.ts) rather than this function
 *    guessing from the status code alone.
 *  - "Already exists" (e.g. creating a ref/branch that's already there) is
 *    a 422 Unprocessable Entity, not a 409 — classified as CONFLICT either
 *    way since the meaning ("this exact thing already exists, don't blindly
 *    retry-create") is the same for our idempotency logic.
 *  - A blocked/conflicting merge is a 405 Method Not Allowed.
 */

export type GitHubErrorKind = "AUTH" | "NOT_FOUND" | "CONFLICT" | "RATE_LIMIT" | "VALIDATION" | "SERVER_ERROR" | "NETWORK" | "UNKNOWN";

export class GitHubApiError extends Error {
  readonly kind: GitHubErrorKind;
  readonly retryable: boolean;
  readonly httpStatus: number | null;

  constructor(kind: GitHubErrorKind, message: string, retryable: boolean, httpStatus: number | null) {
    super(message);
    this.name = "GitHubApiError";
    this.kind = kind;
    this.retryable = retryable;
    this.httpStatus = httpStatus;
  }
}

/**
 * `httpStatus` is null for a network-level failure (timeout/DNS/connection
 * refused). `detail` is the response body's `.message` field, never logged
 * with the Authorization header attached (the caller strips that before
 * this is ever called — see client.ts's request()).
 */
export function mapGitHubError(httpStatus: number | null, detail: string | undefined, rateLimited: boolean): GitHubApiError {
  const suffix = detail ? `: ${detail}` : "";

  if (httpStatus === null) {
    return new GitHubApiError("NETWORK", `Could not reach the GitHub API (timeout or network error)${suffix}`, true, null);
  }
  if (httpStatus === 403 && rateLimited) {
    return new GitHubApiError("RATE_LIMIT", `GitHub API rate limit exceeded${suffix}`, true, httpStatus);
  }
  if (httpStatus === 401 || httpStatus === 403) {
    return new GitHubApiError("AUTH", `GitHub rejected the credentials or denied access (HTTP ${httpStatus})${suffix}`, false, httpStatus);
  }
  if (httpStatus === 404) {
    return new GitHubApiError("NOT_FOUND", `GitHub resource not found (HTTP 404)${suffix}`, false, httpStatus);
  }
  if (httpStatus === 405) {
    return new GitHubApiError("CONFLICT", `GitHub refused the merge — the pull request may have conflicts or required checks pending (HTTP 405)${suffix}`, false, httpStatus);
  }
  if (httpStatus === 409) {
    return new GitHubApiError("CONFLICT", `GitHub reported a conflict (HTTP 409)${suffix}`, false, httpStatus);
  }
  if (httpStatus === 422) {
    return new GitHubApiError("VALIDATION", `GitHub rejected the request — it may already exist, or the input was invalid (HTTP 422)${suffix}`, false, httpStatus);
  }
  if (httpStatus === 429) {
    return new GitHubApiError("RATE_LIMIT", `GitHub rate-limited this request (HTTP 429)${suffix}`, true, httpStatus);
  }
  if (httpStatus >= 500) {
    return new GitHubApiError("SERVER_ERROR", `GitHub returned a server error (HTTP ${httpStatus})${suffix}`, true, httpStatus);
  }
  if (httpStatus >= 400) {
    return new GitHubApiError("VALIDATION", `GitHub rejected the request (HTTP ${httpStatus})${suffix}`, false, httpStatus);
  }
  return new GitHubApiError("UNKNOWN", `Unexpected GitHub response (HTTP ${httpStatus})${suffix}`, false, httpStatus);
}

/** True for the specific, well-known "this thing already exists" shape
 * GitHub returns from POST /git/refs and POST /repos/.../pulls — the
 * idempotency layer (lib/publishing/github/retry-strategy.ts) treats this
 * as "go look it up," never as a hard failure. */
export function isAlreadyExistsError(error: unknown): boolean {
  if (!(error instanceof GitHubApiError)) return false;
  if (error.kind !== "VALIDATION" && error.kind !== "CONFLICT") return false;
  return /already exists|no commits between/i.test(error.message);
}
