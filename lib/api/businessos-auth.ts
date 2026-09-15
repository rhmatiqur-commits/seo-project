import { timingSafeEqual } from "node:crypto";

/**
 * Bearer-token check for the two /api/businessos-integration/** routes
 * (Phase 3D). Same shape as app/api/scheduler/run/route.ts's checkAuth, but
 * with a timing-safe comparison rather than plain `===` — CRON_SECRET only
 * gates a job sweep if guessed, this credential can create real
 * organisation memberships, so it warrants the stronger comparison
 * (protects against a remote timing attack incrementally recovering the
 * secret; `===` on strings short-circuits at the first differing byte,
 * which leaks a small but real timing signal for a credential this
 * sensitive).
 *
 * A pure function -- deliberately no `lib/env` import in this file at all,
 * same reasoning as lib/api/authorize.ts's own pure functions -- so it can
 * be unit-tested (lib/api/businessos-auth.test.ts) without needing the
 * whole required-env schema populated just to check a string comparison.
 * Each route reads `env.BUSINESSOS_INTEGRATION_SECRET` itself and passes
 * it in, the same way it already reads its own request body.
 *
 * Returns false (never throws) on any missing/malformed input, including
 * an empty/undefined `expectedSecret` -- a deployment that hasn't
 * configured BUSINESSOS_INTEGRATION_SECRET yet fails closed, not open.
 */
export function isAuthorizedBearer(authorizationHeader: string | null, expectedSecret: string | undefined): boolean {
  if (!expectedSecret) return false;

  const header = authorizationHeader ?? "";
  const expected = `Bearer ${expectedSecret}`;

  const headerBuf = Buffer.from(header);
  const expectedBuf = Buffer.from(expected);
  // timingSafeEqual throws on a length mismatch rather than returning
  // false -- guard that first so a short/wrong header can't crash the
  // request handler instead of just failing auth.
  if (headerBuf.length !== expectedBuf.length) return false;

  return timingSafeEqual(headerBuf, expectedBuf);
}
