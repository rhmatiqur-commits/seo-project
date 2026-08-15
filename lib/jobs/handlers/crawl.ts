import { crawlWebsite } from "@/lib/crawler/crawler";
import { getWebsite } from "@/lib/db/websites";
import type { JobHandler } from "@/lib/jobs/types";

export const handleCrawlWebsite: JobHandler = async ({ job }) => {
  if (!job.website_id) throw new Error("CRAWL_WEBSITE job is missing website_id");
  const website = await getWebsite(job.website_id);
  if (!website) throw new Error(`Website ${job.website_id} not found`);

  const summary = await crawlWebsite(website);
  return { ...summary };
};
