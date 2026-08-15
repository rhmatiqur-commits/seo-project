import robotsParser, { type Robot } from "robots-parser";
import { env } from "@/lib/env";

export interface RobotsInfo {
  available: boolean;
  robots: Robot | null;
  sitemapUrls: string[];
}

export async function fetchRobots(baseUrl: string): Promise<RobotsInfo> {
  const robotsUrl = new URL("/robots.txt", baseUrl).toString();
  try {
    const res = await fetch(robotsUrl, {
      headers: { "User-Agent": env.CRAWLER_USER_AGENT },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { available: false, robots: null, sitemapUrls: [] };
    const body = await res.text();
    const robots = robotsParser(robotsUrl, body);
    return { available: true, robots, sitemapUrls: robots.getSitemaps() };
  } catch {
    return { available: false, robots: null, sitemapUrls: [] };
  }
}

export function isAllowed(robots: Robot | null, url: string): boolean {
  if (!robots) return true; // no robots.txt -> everything allowed
  const allowed = robots.isAllowed(url, env.CRAWLER_USER_AGENT);
  // isAllowed() can return undefined for malformed rules; fail open (allow).
  return allowed !== false;
}

export async function checkSitemapAvailable(baseUrl: string, sitemapUrls: string[]): Promise<boolean> {
  const candidates = sitemapUrls.length > 0 ? sitemapUrls : [new URL("/sitemap.xml", baseUrl).toString()];
  for (const candidate of candidates) {
    try {
      const res = await fetch(candidate, {
        method: "HEAD",
        headers: { "User-Agent": env.CRAWLER_USER_AGENT },
        signal: AbortSignal.timeout(8_000),
      });
      if (res.ok) return true;
    } catch {
      // try next candidate
    }
  }
  return false;
}
