import { fetchWithRedirects } from "@/lib/crawler/crawler";
import { parseHtml } from "@/lib/crawler/parse";
import { fetchRobots, isAllowed } from "@/lib/crawler/robots";
import { extractMajorTopics } from "@/lib/serp/major-topics";
import type { Heading } from "@/lib/supabase/types";

export { extractMajorTopics };

/**
 * Single-URL fetch + structured-metadata extraction for a competitor page —
 * reuses the crawler's own fetch/redirect/timeout/robots-respecting/parse
 * logic (lib/crawler/crawler.ts's fetchWithRedirects, lib/crawler/parse.ts,
 * lib/crawler/robots.ts) rather than a second crawler implementation. Only
 * ever extracts structured metadata (title/meta/h1/headings/word count/
 * structured-data types) — never body text or raw HTML, per spec: this is
 * for competitive analysis, not content reproduction.
 */

export interface CompetitorPageAnalysis {
  httpStatus: number | null;
  title: string | null;
  metaDescription: string | null;
  h1: string | null;
  headings: Heading[];
  wordCount: number | null;
  hasStructuredData: boolean;
  structuredDataTypes: string[];
  majorTopics: string[];
}

/** Fetches and analyzes one competitor page. Returns null if robots.txt
 * disallows it or the fetch produced no HTML — never throws for an
 * individual page (the caller decides how to treat a null result across a
 * batch of competitor pages). */
export async function fetchAndAnalyzeCompetitorPage(url: string): Promise<CompetitorPageAnalysis | null> {
  const origin = new URL(url).origin;
  const { robots } = await fetchRobots(origin);
  if (!isAllowed(robots, url)) return null;

  const result = await fetchWithRedirects(url);
  if (!result.html) return { httpStatus: result.status || null, title: null, metaDescription: null, h1: null, headings: [], wordCount: null, hasStructuredData: false, structuredDataTypes: [], majorTopics: [] };

  const hostname = new URL(result.finalUrl).hostname;
  const parsed = parseHtml(result.html, result.finalUrl, hostname);

  return {
    httpStatus: result.status || null,
    title: parsed.title,
    metaDescription: parsed.metaDescription,
    h1: parsed.h1,
    headings: parsed.headings,
    wordCount: parsed.wordCount,
    hasStructuredData: parsed.hasStructuredData,
    structuredDataTypes: parsed.structuredDataTypes,
    majorTopics: extractMajorTopics([parsed.title, parsed.h1, ...parsed.headings.map((h) => h.text)]),
  };
}
