/**
 * Markdown-link extraction and internal-link validation, shared by the
 * deterministic QA check (lib/content/qa/deterministic.ts) and the brief
 * builder's own internal-link suggestions. Pure, no DB/AI.
 */

export interface ExtractedLink {
  text: string;
  href: string;
}

const MARKDOWN_LINK_RE = /\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

export function extractMarkdownLinks(body: string): ExtractedLink[] {
  const links: ExtractedLink[] = [];
  for (const match of body.matchAll(MARKDOWN_LINK_RE)) {
    links.push({ text: match[1] ?? "", href: match[2] ?? "" });
  }
  return links;
}

function normalizeUrlForComparison(url: string, baseUrl: string): string {
  let value = url.trim();
  if (value.startsWith(baseUrl)) value = value.slice(baseUrl.length);
  try {
    const parsed = new URL(value, baseUrl);
    if (parsed.origin === new URL(baseUrl).origin) value = parsed.pathname;
  } catch {
    // Not a parseable absolute URL — treat the raw value as a relative path.
  }
  if (!value.startsWith("/")) value = `/${value}`;
  return value.replace(/\/+$/, "") || "/";
}

/** True when `href` points at the same website as `baseUrl` (relative path,
 * or an absolute URL sharing baseUrl's origin) — anchors/mailto/external
 * links are never "internal" and are never checked against known pages. */
export function isInternalLink(href: string, baseUrl: string): boolean {
  if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return false;
  if (href.startsWith("/")) return true;
  try {
    const origin = new URL(baseUrl).origin;
    return new URL(href).origin === origin;
  } catch {
    // No protocol and no leading slash (e.g. "some-page") — still same-site relative.
    return !href.includes("://");
  }
}

export interface InternalLinkValidationResult {
  /** Internal links in the body that resolve to a real, known page. */
  validLinks: ExtractedLink[];
  /** Internal links in the body that do NOT match any known page — "do not create links to pages that do not exist". */
  invalidLinks: ExtractedLink[];
  /** Brief-suggested links that never made it into the body — a recommendation, not a requirement. */
  missingSuggested: string[];
}

/**
 * `knownPageUrls` must include every real page the body is allowed to link
 * to — existing website_pages plus the brief's own targetUrl (self-reference
 * for a not-yet-created page is fine).
 */
export function validateInternalLinks(body: string, baseUrl: string, knownPageUrls: string[], suggestedUrls: string[]): InternalLinkValidationResult {
  const knownNormalized = new Set(knownPageUrls.map((u) => normalizeUrlForComparison(u, baseUrl)));
  const links = extractMarkdownLinks(body);

  const validLinks: ExtractedLink[] = [];
  const invalidLinks: ExtractedLink[] = [];
  for (const link of links) {
    if (!isInternalLink(link.href, baseUrl)) continue;
    if (knownNormalized.has(normalizeUrlForComparison(link.href, baseUrl))) validLinks.push(link);
    else invalidLinks.push(link);
  }

  const linkedNormalized = new Set(links.filter((l) => isInternalLink(l.href, baseUrl)).map((l) => normalizeUrlForComparison(l.href, baseUrl)));
  const missingSuggested = suggestedUrls.filter((u) => !linkedNormalized.has(normalizeUrlForComparison(u, baseUrl)));

  return { validLinks, invalidLinks, missingSuggested };
}
