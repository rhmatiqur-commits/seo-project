/**
 * Minimal in-memory fixed-window rate limiter for the two
 * /api/businessos-integration/** routes (Phase 3D). No rate-limiting
 * utility existed anywhere in this codebase before this -- deliberately
 * the simplest thing that satisfies the requirement rather than pulling in
 * a new dependency or a shared-store design nothing else here needs yet.
 *
 * Threat model this actually defends: the caller pool is exactly one known
 * secret-holder (the BusinessOS deployment), so this exists to blunt a
 * buggy retry loop, not to stop distributed abuse -- a leaked secret is a
 * bigger problem this can't solve, mitigated by rotation and audit
 * logging, not rate limiting. Resets on cold start/redeploy and is not
 * shared across serverless instances -- a real, accepted limitation for
 * v1, not a durable multi-instance solution (see this repo's own Phase 3D
 * notes for the upgrade path if the caller pool ever grows).
 */

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 30;

const hits = new Map<string, number[]>();

export function isRateLimited(key: string, now: number = Date.now()): boolean {
  const windowStart = now - WINDOW_MS;
  const timestamps = (hits.get(key) ?? []).filter((t) => t > windowStart);

  if (timestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    hits.set(key, timestamps);
    return true;
  }

  timestamps.push(now);
  hits.set(key, timestamps);
  return false;
}
