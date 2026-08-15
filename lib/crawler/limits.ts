/** Hard ceilings applied on top of the per-website configured limits, so a
 * misconfigured website record can never trigger an uncontrolled crawl. */
export const CRAWLER_HARD_LIMITS = {
  maxPages: 500,
  maxDepth: 10,
  requestTimeoutMs: 10_000,
  delayBetweenRequestsMs: 250,
  maxRedirectHops: 5,
  maxCrawlDurationMs: 5 * 60 * 1000,
} as const;

export function clampConfig(input: { maxPages: number; maxDepth: number }) {
  return {
    maxPages: Math.min(Math.max(1, input.maxPages), CRAWLER_HARD_LIMITS.maxPages),
    maxDepth: Math.min(Math.max(0, input.maxDepth), CRAWLER_HARD_LIMITS.maxDepth),
  };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
