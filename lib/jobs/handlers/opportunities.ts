import { generateSeoOpportunities } from "@/lib/ai/seo-analysis";
import { getWebsite } from "@/lib/db/websites";
import type { JobHandler } from "@/lib/jobs/types";

/**
 * Backs both ANALYSE_WEBSITE and GENERATE_SEO_OPPORTUNITIES job types.
 * Phase 1 runs a single AI pass that classifies pages/gaps and produces
 * opportunities+tasks in one go; they're kept as distinct job types so a
 * later phase can split "analysis" from "opportunity generation" (e.g. once
 * a keyword-data provider makes a richer, separate analysis step worthwhile)
 * without a job-model or schema change.
 */
export const handleGenerateSeoOpportunities: JobHandler = async ({ job }) => {
  if (!job.website_id) throw new Error("job is missing website_id");
  const website = await getWebsite(job.website_id);
  if (!website) throw new Error(`Website ${job.website_id} not found`);

  const result = await generateSeoOpportunities(website, job.id);
  return { ...result };
};
