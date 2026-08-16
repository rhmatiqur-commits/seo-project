/**
 * Pure URL/slug helpers for the publishing pipeline. No network, no DB —
 * unit-tested directly with plain strings, same convention as
 * lib/keywords/normalize.ts.
 */

/** Path segments of a URL, leading/trailing slashes stripped. Falls back to
 * treating the input as a bare path if it isn't a parseable absolute URL. */
export function extractPathSegments(url: string): string[] {
  try {
    const parsed = new URL(url);
    return parsed.pathname.split("/").filter(Boolean);
  } catch {
    return url.split("/").filter(Boolean);
  }
}

/** The leaf slug WordPress's `?slug=` filter expects — the last path segment. */
export function slugFromUrl(url: string): string {
  const segments = extractPathSegments(url);
  return segments[segments.length - 1] ?? "";
}

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Loose validation matching what our own brief builder produces
 * (lib/content/build-brief.ts's suggestUrlSlug) and what real-world page
 * slugs look like — lowercase, hyphenated, no spaces/special characters. */
export function isValidSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug);
}

export type PublicationContentType = "CREATE_NEW_PAGE" | "OPTIMISE_EXISTING_PAGE";

export interface ResolveTargetUrlInput {
  contentType: PublicationContentType;
  /** The real, already-existing page URL (only present for OPTIMISE_EXISTING_PAGE). */
  existingPageUrl: string | null;
  /** The brief's recommended URL for a brand-new page. */
  briefTargetUrl: string | null;
}

/**
 * "For existing pages: preserve the existing URL unless the approved task
 * explicitly requires a URL change. Do not automatically change URLs
 * because an AI recommendation says so." — for OPTIMISE_EXISTING_PAGE this
 * always returns the real existing URL, never the brief's own targetUrl
 * recommendation, even if they differ.
 */
export function resolvePublicationTargetUrl(input: ResolveTargetUrlInput): string | null {
  if (input.contentType === "OPTIMISE_EXISTING_PAGE") return input.existingPageUrl;
  return input.briefTargetUrl;
}
