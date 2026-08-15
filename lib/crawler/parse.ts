import * as cheerio from "cheerio";
import { normalizeUrl } from "@/lib/crawler/normalize-url";
import type { Heading } from "@/lib/supabase/types";

export interface ParsedLink {
  targetUrl: string;
  anchorText: string | null;
  isInternal: boolean;
  isExternal: boolean;
}

export interface ParsedPage {
  title: string | null;
  metaDescription: string | null;
  h1: string | null;
  headings: Heading[];
  wordCount: number;
  canonicalUrl: string | null;
  isNoindexMeta: boolean;
  hasStructuredData: boolean;
  structuredDataTypes: string[];
  imagesCount: number;
  imagesMissingAltCount: number;
  links: ParsedLink[];
  rawMeta: Record<string, string>;
}

/** Parses a crawled page's HTML into the structured fields we persist. */
export function parseHtml(html: string, pageUrl: string, siteHostname: string): ParsedPage {
  const $ = cheerio.load(html);

  // Strip non-content elements before computing word count / heading text.
  $("script, style, noscript, template").remove();

  const title = $("head > title").first().text().trim() || null;
  const metaDescription = $('meta[name="description"]').attr("content")?.trim() || null;

  const headings: Heading[] = [];
  $("h1, h2, h3, h4, h5, h6").each((_, el) => {
    const level = Number(el.tagName.slice(1));
    const text = $(el).text().trim().replace(/\s+/g, " ");
    if (text) headings.push({ level, text });
  });
  const h1 = headings.find((h) => h.level === 1)?.text ?? null;

  const bodyText = $("body").text().replace(/\s+/g, " ").trim();
  const wordCount = bodyText ? bodyText.split(" ").filter(Boolean).length : 0;

  let canonicalUrl = $('link[rel="canonical"]').attr("href")?.trim() || null;
  if (canonicalUrl) canonicalUrl = normalizeUrl(canonicalUrl, pageUrl);

  const robotsMeta = ($('meta[name="robots"]').attr("content") || "").toLowerCase();
  const isNoindexMeta = robotsMeta.includes("noindex");

  const structuredDataTypes = new Set<string>();
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text();
    try {
      const json = JSON.parse(raw);
      collectJsonLdTypes(json, structuredDataTypes);
    } catch {
      // malformed JSON-LD is itself worth flagging later via audit rules; ignore here
    }
  });

  let imagesCount = 0;
  let imagesMissingAltCount = 0;
  $("img").each((_, el) => {
    imagesCount++;
    const alt = $(el).attr("alt");
    if (!alt || !alt.trim()) imagesMissingAltCount++;
  });

  const links: ParsedLink[] = [];
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:")) return;
    const normalized = normalizeUrl(href, pageUrl);
    if (!normalized) return;
    let isInternal = false;
    try {
      isInternal = new URL(normalized).hostname.replace(/^www\./, "") === siteHostname.replace(/^www\./, "");
    } catch {
      isInternal = false;
    }
    links.push({
      targetUrl: normalized,
      anchorText: $(el).text().trim().slice(0, 300) || null,
      isInternal,
      isExternal: !isInternal,
    });
  });

  const rawMeta: Record<string, string> = {};
  $("meta[property^='og:'], meta[name^='twitter:']").each((_, el) => {
    const key = $(el).attr("property") || $(el).attr("name");
    const content = $(el).attr("content");
    if (key && content) rawMeta[key] = content;
  });

  return {
    title,
    metaDescription,
    h1,
    headings,
    wordCount,
    canonicalUrl,
    isNoindexMeta,
    hasStructuredData: structuredDataTypes.size > 0,
    structuredDataTypes: Array.from(structuredDataTypes),
    imagesCount,
    imagesMissingAltCount,
    links,
    rawMeta,
  };
}

function collectJsonLdTypes(node: unknown, out: Set<string>): void {
  if (Array.isArray(node)) {
    for (const item of node) collectJsonLdTypes(item, out);
    return;
  }
  if (node && typeof node === "object") {
    const obj = node as Record<string, unknown>;
    const type = obj["@type"];
    if (typeof type === "string") out.add(type);
    else if (Array.isArray(type)) type.forEach((t) => typeof t === "string" && out.add(t));
    if (Array.isArray(obj["@graph"])) collectJsonLdTypes(obj["@graph"], out);
  }
}
