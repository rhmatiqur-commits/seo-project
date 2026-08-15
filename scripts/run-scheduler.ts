/**
 * Local-dev convenience: runs the same sweep the /api/scheduler/run endpoint
 * (and the GitHub Actions cron workflow) triggers, without needing curl or a
 * running server.
 *
 * Usage: npm run scheduler:run
 */
import { runScheduledSweep } from "../lib/jobs/scheduler";

async function main() {
  const summary = await runScheduledSweep();
  console.log(JSON.stringify(summary, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
