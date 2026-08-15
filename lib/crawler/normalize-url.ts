import { createHash } from "node:crypto";

/**
 * Normalizes a URL for dedupe purposes: strips fragment, lowercases the host,
 * strips default ports, removes a trailing slash on the path (except root),
 * and drops a fixed list of known tracking query params.
 */
const TRACKING_PARAMS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid"];

export function normalizeUrl(raw: string, base?: string): string | null {
  try {
    const url = new URL(raw, base);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    if ((url.protocol === "http:" && url.port === "80") || (url.protocol === "https:" && url.port === "443")) {
      url.port = "";
    }
    for (const param of TRACKING_PARAMS) url.searchParams.delete(param);
    // Sort remaining query params for stable dedupe.
    url.searchParams.sort();
    if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.slice(0, -1);
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function urlHash(normalized: string): string {
  return createHash("sha256").update(normalized).digest("hex");
}

/** Registrable-domain-ish comparison: same hostname, ignoring a leading "www." */
export function isSameSite(urlA: string, urlB: string): boolean {
  try {
    const a = new URL(urlA).hostname.replace(/^www\./, "");
    const b = new URL(urlB).hostname.replace(/^www\./, "");
    return a === b;
  } catch {
    return false;
  }
}
