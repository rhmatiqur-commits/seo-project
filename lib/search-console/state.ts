import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed, expiring OAuth `state` parameter for the Google Search Console
 * connect flow. Google's redirect back to our callback can't carry Basic
 * Auth, so this is the callback's only CSRF/tamper defence: without the
 * server's client secret, an attacker cannot forge a state that binds to an
 * arbitrary website_id. Reuses GOOGLE_OAUTH_CLIENT_SECRET as the HMAC key so
 * no additional secret needs to be provisioned.
 *
 * Pure functions (secret/ttl/now all passed in) so this is fully testable
 * without touching lib/env.ts or real time.
 */

export interface SearchConsoleStatePayload {
  websiteId: string;
  organizationId: string;
}

const DEFAULT_TTL_MS = 10 * 60 * 1000; // 10 minutes — long enough for a human to complete the Google consent screen.

function sign(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

/** Builds a signed state token: base64url(JSON) + "." + HMAC signature. */
export function signState(payload: SearchConsoleStatePayload, secret: string, ttlMs: number = DEFAULT_TTL_MS, now: number = Date.now()): string {
  const body = JSON.stringify({ ...payload, exp: now + ttlMs });
  const encodedBody = Buffer.from(body, "utf8").toString("base64url");
  const signature = sign(encodedBody, secret);
  return `${encodedBody}.${signature}`;
}

/**
 * Verifies a state token: checks the HMAC signature (constant-time compare)
 * and expiry. Returns the payload on success, or null on any failure
 * (malformed, tampered, or expired) — callers should treat null as "reject
 * the callback," never distinguish the failure reason to the client.
 */
export function verifyState(token: string, secret: string, now: number = Date.now()): SearchConsoleStatePayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encodedBody, signature] = parts as [string, string];

  const expectedSignature = sign(encodedBody, secret);
  const signatureBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expectedSignature);
  if (signatureBuf.length !== expectedBuf.length || !timingSafeEqual(signatureBuf, expectedBuf)) {
    return null;
  }

  try {
    const body = Buffer.from(encodedBody, "base64url").toString("utf8");
    const parsed = JSON.parse(body) as { websiteId?: unknown; organizationId?: unknown; exp?: unknown };
    if (typeof parsed.websiteId !== "string" || typeof parsed.organizationId !== "string" || typeof parsed.exp !== "number") {
      return null;
    }
    if (now > parsed.exp) return null;
    return { websiteId: parsed.websiteId, organizationId: parsed.organizationId };
  } catch {
    return null;
  }
}
