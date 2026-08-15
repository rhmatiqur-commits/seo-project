import { crawlWebsite } from "@/lib/crawler/crawler";
import { getWebsite, updateWebsite } from "@/lib/db/websites";
import type { JobHandler } from "@/lib/jobs/types";

export const handleCrawlWebsite: JobHandler = async ({ job }) => {
  if (!job.website_id) throw new Error("CRAWL_WEBSITE job is missing website_id");
  const website = await getWebsite(job.website_id);
  if (!website) throw new Error(`Website ${job.website_id} not found`);

  const summary = await crawlWebsite(website);

  // Schedule the next recurring crawl. crawlWebsite() itself already persists
  // last_crawled_at/robots/sitemap availability (lib/crawler/crawler.ts) — this
  // is the one Phase 2A addition, kept in the job handler rather than the
  // crawler itself since "when's the next run" is a scheduling concern, not
  // a crawling one.
  const nextCrawlAt = new Date(Date.now() + website.crawl_frequency_days * 24 * 60 * 60 * 1000);
  await updateWebsite(website.id, { next_crawl_at: nextCrawlAt.toISOString() });

  return { ...summary };
};
