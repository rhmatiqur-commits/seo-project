/**
 * Manual worker sweep: processes any jobs currently PENDING. This is the seam
 * a real scheduler/cron would call instead of a human running `npm run
 * jobs:sweep` — see README "Scheduler" section.
 *
 * Usage: npm run jobs:sweep
 */
import { processPendingJobs } from "../lib/jobs/runner";

async function main() {
  const result = await processPendingJobs();
  console.log(`Processed ${result.processed} pending job(s).`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
