import { runSeoAudit } from "@/lib/audit/engine";
import { getWebsite } from "@/lib/db/websites";
import type { JobHandler } from "@/lib/jobs/types";

export const handleRunSeoAudit: JobHandler = async ({ job }) => {
  if (!job.website_id) throw new Error("RUN_SEO_AUDIT job is missing website_id");
  const website = await getWebsite(job.website_id);
  if (!website) throw new Error(`Website ${job.website_id} not found`);

  const result = await runSeoAudit(website, job.id);
  return { ...result };
};
