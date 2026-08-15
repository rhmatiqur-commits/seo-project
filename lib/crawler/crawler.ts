import { env } from "@/lib/env";
import { normalizeUrl, urlHash, isSameSite } from "@/lib/crawler/normalize-url";
import { parseHtml } from "@/lib/crawler/parse";
import { fetchRobots, isAllowed, checkSitemapAvailable } from "@/lib/crawler/robots";
import { CRAWLER_HARD_LIMITS, clampConfig, sleep } from "@/lib/crawler/limits";
import { upsertPage, insertPageLinks, recomputeOrphanPages } from "@/lib/db/pages";
import { updateWebsite } from "@/lib/db/websites";
import type { Database, RedirectHop } from "@/lib/supabase/types";

type WebsiteRow = Database["public"]["Tables"]["websites"]["Row"];

export interface CrawlSummary {
  pagesCrawled: number;
  pagesQueued: number;
  errors: number;
  robotsAvailable: boolean;
  sitemapAvailable: boolean;
  stoppedReason: "queue_empty" | "max_pages" | "max_duration";
}

interface QueueItem {
  url: string;
  depth: number;
}

export interface FetchResult {
  finalUrl: string;
  status: number;
  redirectChain: RedirectHop[];
  contentType: string | null;
  html: string | null;
  noindexHeader: boolean;
}

/** Exported (not just used internally by crawlWebsite) so single-URL
 * fetchers — e.g. lib/serp/fetch-competitor-page.ts — reuse the exact same
 * fetch/redirect/timeout/user-agent logic instead of a second copy. */
export async function fetchWithRedirects(startUrl: string): Promise<FetchResult> {
  const chain: RedirectHop[] = [];
  let currentUrl = startUrl;

  for (let hop = 0; hop <= CRAWLER_HARD_LIMITS.maxRedirectHops; hop++) {
    const res = await fetch(currentUrl, {
      redirect: "manual",
      headers: { "User-Agent": env.CRAWLER_USER_AGENT },
      signal: AbortSignal.timeout(CRAWLER_HARD_LIMITS.requestTimeoutMs),
    });

    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      chain.push({ url: currentUrl, status: res.status });
      const next = normalizeUrl(res.headers.get("location")!, currentUrl);
      if (!next || hop === CRAWLER_HARD_LIMITS.maxRedirectHops) {
        return { finalUrl: currentUrl, status: res.status, redirectChain: chain, contentType: null, html: null, noindexHeader: false };
      }
      currentUrl = next;
      continue;
    }

    const contentType = res.headers.get("content-type");
    const noindexHeader = (res.headers.get("x-robots-tag") || "").toLowerCase().includes("noindex");
    const html = contentType?.includes("text/html") ? await res.text() : null;
    return { finalUrl: currentUrl, status: res.status, redirectChain: chain, contentType, html, noindexHeader };
  }

  // Unreachable given the loop bound above, but keeps TypeScript happy.
  return { finalUrl: currentUrl, status: 0, redirectChain: chain, contentType: null, html: null, noindexHeader: false };
}

/**
 * Crawls a website breadth-first from its base_url, respecting robots.txt and
 * the configured (hard-capped) page/depth limits. Writes pages and links to
 * the database incrementally so partial progress survives a crash/timeout.
 */
export async function crawlWebsite(
  website: WebsiteRow,
  onProgress?: (crawled: number, queued: number) => void
): Promise<CrawlSummary> {
  const { maxPages, maxDepth } = clampConfig({
    maxPages: website.crawl_max_pages,
    maxDepth: website.crawl_max_depth,
  });

  const startedAt = Date.now();
  const baseUrl = normalizeUrl(website.base_url);
  if (!baseUrl) throw new Error(`Invalid base_url for website ${website.id}: ${website.base_url}`);
  const siteHostname = new URL(baseUrl).hostname;

  const { available: robotsAvailable, robots, sitemapUrls } = await fetchRobots(baseUrl);
  const sitemapAvailable = await checkSitemapAvailable(baseUrl, sitemapUrls);

  const visited = new Set<string>();
  const queued = new Set<string>([baseUrl]);
  const queue: QueueItem[] = [{ url: baseUrl, depth: 0 }];
  const pageIdByUrl = new Map<string, string>();
  const pendingLinks: { sourceUrl: string; targetUrl: string; anchorText: string | null; isInternal: boolean; isExternal: boolean }[] = [];

  let errors = 0;
  let stoppedReason: CrawlSummary["stoppedReason"] = "queue_empty";

  while (queue.length > 0) {
    if (visited.size >= maxPages) {
      stoppedReason = "max_pages";
      break;
    }
    if (Date.now() - startedAt > CRAWLER_HARD_LIMITS.maxCrawlDurationMs) {
      stoppedReason = "max_duration";
      break;
    }

    const item = queue.shift()!;
    if (visited.has(item.url)) continue;
    visited.add(item.url);

    if (!isAllowed(robots, item.url)) continue;

    try {
      const result = await fetchWithRedirects(item.url);
      const parsed = result.html ? parseHtml(result.html, result.finalUrl, siteHostname) : null;

      const page = await upsertPage({
        website_id: website.id,
        url: item.url,
        url_hash: urlHash(item.url),
        path: safePath(item.url),
        depth: item.depth,
        http_status: result.status || null,
        redirect_chain: result.redirectChain.length > 0 ? result.redirectChain : null,
        title: parsed?.title ?? null,
        meta_description: parsed?.metaDescription ?? null,
        h1: parsed?.h1 ?? null,
        headings: parsed?.headings ?? [],
        word_count: parsed?.wordCount ?? null,
        canonical_url: parsed?.canonicalUrl ?? null,
        is_noindex: Boolean(parsed?.isNoindexMeta || result.noindexHeader),
        has_structured_data: parsed?.hasStructuredData ?? false,
        structured_data_types: parsed?.structuredDataTypes ?? [],
        images_count: parsed?.imagesCount ?? 0,
        images_missing_alt_count: parsed?.imagesMissingAltCount ?? 0,
        internal_links_count: parsed?.links.filter((l) => l.isInternal).length ?? 0,
        external_links_count: parsed?.links.filter((l) => l.isExternal).length ?? 0,
        raw_meta: parsed?.rawMeta ?? {},
        crawled_at: new Date().toISOString(),
      });
      pageIdByUrl.set(item.url, page.id);

      if (parsed) {
        for (const link of parsed.links) {
          pendingLinks.push({ sourceUrl: item.url, targetUrl: link.targetUrl, anchorText: link.anchorText, isInternal: link.isInternal, isExternal: link.isExternal });
          if (
            link.isInternal &&
            isSameSite(link.targetUrl, baseUrl) &&
            !visited.has(link.targetUrl) &&
            !queued.has(link.targetUrl) &&
            item.depth + 1 <= maxDepth &&
            queued.size < maxPages
          ) {
            queued.add(link.targetUrl);
            queue.push({ url: link.targetUrl, depth: item.depth + 1 });
          }
        }
      }
    } catch {
      errors++;
    }

    onProgress?.(visited.size, queue.length);
    await sleep(CRAWLER_HARD_LIMITS.delayBetweenRequestsMs);
  }

  // Resolve target_page_id for links that point at pages we actually crawled,
  // then persist. Links to un-crawled internal pages or external domains are
  // still recorded (target_page_id null) so the audit engine can reason about them.
  const linkRows = pendingLinks.map((l) => ({
    website_id: website.id,
    source_page_id: pageIdByUrl.get(l.sourceUrl)!,
    target_url: l.targetUrl,
    target_page_id: pageIdByUrl.get(l.targetUrl) ?? null,
    anchor_text: l.anchorText,
    is_internal: l.isInternal,
    is_external: l.isExternal,
  }));
  // Insert in batches to stay well under any single-request payload limits.
  const BATCH = 500;
  for (let i = 0; i < linkRows.length; i += BATCH) {
    await insertPageLinks(linkRows.slice(i, i + BATCH));
  }

  await recomputeOrphanPages(website.id);

  await updateWebsite(website.id, {
    robots_txt_available: robotsAvailable,
    sitemap_available: sitemapAvailable,
    last_crawled_at: new Date().toISOString(),
  });

  return {
    pagesCrawled: visited.size,
    pagesQueued: queue.length,
    errors,
    robotsAvailable,
    sitemapAvailable,
    stoppedReason,
  };
}

function safePath(url: string): string | null {
  try {
    return new URL(url).pathname;
  } catch {
    return null;
  }
}
