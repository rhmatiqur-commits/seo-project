/**
 * Pure WordPress REST API error classification — zero network, zero
 * dependency on @/lib/env (same "must not import anything env-touching at
 * module scope" lesson learned repeatedly in Phase 3, so this stays
 * unit-testable without --env-file). lib/publishing/wordpress-provider.ts
 * throws these; lib/jobs/handlers/{create-draft,publish-content}.ts decide
 * whether to re-throw as a lib/jobs/types.ts PermanentJobError based on
 * `.retryable`.
 */

export type WordPressErrorKind = "AUTH" | "NOT_FOUND" | "CONFLICT" | "BAD_REQUEST" | "RATE_LIMIT" | "SERVER_ERROR" | "NETWORK" | "UNKNOWN";

export class WordPressApiError extends Error {
  readonly kind: WordPressErrorKind;
  readonly retryable: boolean;
  readonly httpStatus: number | null;

  constructor(kind: WordPressErrorKind, message: string, retryable: boolean, httpStatus: number | null) {
    super(message);
    this.name = "WordPressApiError";
    this.kind = kind;
    this.retryable = retryable;
    this.httpStatus = httpStatus;
  }
}

/**
 * `httpStatus` is null for a network-level failure (timeout, DNS, connection
 * refused — the request never got an HTTP response at all). `detail` is an
 * optional short message from the response body, never logged with
 * credentials attached (the caller strips those before this is ever called).
 */
export function mapWordPressError(httpStatus: number | null, detail?: string): WordPressApiError {
  const suffix = detail ? `: ${detail}` : "";

  if (httpStatus === null) {
    return new WordPressApiError("NETWORK", `Could not reach the WordPress site (timeout or network error)${suffix}`, true, null);
  }
  if (httpStatus === 401 || httpStatus === 403) {
    return new WordPressApiError("AUTH", `WordPress rejected the credentials (HTTP ${httpStatus})${suffix}`, false, httpStatus);
  }
  if (httpStatus === 404) {
    return new WordPressApiError("NOT_FOUND", `WordPress page not found (HTTP 404)${suffix}`, false, httpStatus);
  }
  if (httpStatus === 409) {
    return new WordPressApiError("CONFLICT", `WordPress reported a conflict — a page may already exist at this location (HTTP 409)${suffix}`, false, httpStatus);
  }
  if (httpStatus === 429) {
    return new WordPressApiError("RATE_LIMIT", `WordPress rate-limited this request (HTTP 429)${suffix}`, true, httpStatus);
  }
  if (httpStatus >= 500) {
    return new WordPressApiError("SERVER_ERROR", `WordPress returned a server error (HTTP ${httpStatus})${suffix}`, true, httpStatus);
  }
  if (httpStatus >= 400) {
    return new WordPressApiError("BAD_REQUEST", `WordPress rejected the request (HTTP ${httpStatus})${suffix}`, false, httpStatus);
  }
  return new WordPressApiError("UNKNOWN", `Unexpected WordPress response (HTTP ${httpStatus})${suffix}`, false, httpStatus);
}
