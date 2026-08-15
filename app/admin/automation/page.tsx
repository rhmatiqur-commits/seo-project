import Link from "next/link";
import { getJobStats, getLatestJobForWebsite } from "@/lib/db/jobs";
import { getLastSchedulerRun, listRecentSchedulerRuns } from "@/lib/db/scheduler-runs";
import { listAllWebsitesForAutomation } from "@/lib/db/websites";
import { runSchedulerAction, processPendingJobsAction } from "@/app/admin/actions";

export const dynamic = "force-dynamic";

function fmt(date: string | null): string {
  return date ? new Date(date).toLocaleString() : "-";
}

export default async function AutomationPage() {
  const [stats, lastRun, recentRuns, websites] = await Promise.all([
    getJobStats(),
    getLastSchedulerRun(),
    listRecentSchedulerRuns(10),
    listAllWebsitesForAutomation(),
  ]);

  const websiteRows = await Promise.all(
    websites.map(async (w) => ({
      website: w,
      lastAnalysis: await getLatestJobForWebsite(w.id, "GENERATE_SEO_OPPORTUNITIES", "COMPLETED"),
    }))
  );

  return (
    <>
      <h1>Automation</h1>
      <p className="muted">
        The scheduler runs on a cron (see <code>.github/workflows/scheduler.yml</code>) and can also be triggered
        manually below for testing. It recovers stale jobs, retries eligible failures, enqueues crawls for due
        websites, then drains the job queue — see README for details.
      </p>

      <div className="card row">
        <form action={runSchedulerAction}>
          <button className="btn" type="submit">
            Run scheduler now
          </button>
        </form>
        <form action={processPendingJobsAction}>
          <button className="btn secondary" type="submit">
            Process pending jobs
          </button>
        </form>
      </div>

      <h2>Job stats (last {stats.sampledJobCount} jobs)</h2>
      <table>
        <thead>
          <tr>
            <th>Pending</th>
            <th>Processing</th>
            <th>Completed</th>
            <th>Failed</th>
            <th>Cancelled</th>
            <th>Avg duration</th>
            <th>Last successful run</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{stats.byStatus.PENDING}</td>
            <td>{stats.byStatus.PROCESSING}</td>
            <td>{stats.byStatus.COMPLETED}</td>
            <td>{stats.byStatus.FAILED}</td>
            <td>{stats.byStatus.CANCELLED}</td>
            <td>{stats.averageDurationMs !== null ? `${Math.round(stats.averageDurationMs / 1000)}s` : "-"}</td>
            <td className="muted">{fmt(stats.lastSuccessfulRunAt)}</td>
          </tr>
        </tbody>
      </table>

      <h2>Scheduler</h2>
      {lastRun ? (
        <p className="muted">
          Last run: <span className={`badge ${lastRun.status}`}>{lastRun.status}</span> started {fmt(lastRun.started_at)}, completed{" "}
          {fmt(lastRun.completed_at)} &middot; {lastRun.websites_checked} website(s) checked &middot; {lastRun.crawl_jobs_created} crawl(s)
          created &middot; {lastRun.stale_recovered} stale recovered &middot; {lastRun.jobs_retried} retried
          {lastRun.error && <span> &middot; error: {lastRun.error}</span>}
        </p>
      ) : (
        <p className="muted">No scheduler runs recorded yet. Next run: see the cron schedule in the GitHub Actions workflow.</p>
      )}

      <table>
        <thead>
          <tr>
            <th>Started</th>
            <th>Status</th>
            <th>Websites</th>
            <th>Crawls created</th>
            <th>Stale recovered</th>
            <th>Retried</th>
            <th>Jobs processed</th>
          </tr>
        </thead>
        <tbody>
          {recentRuns.map((run) => (
            <tr key={run.id}>
              <td className="muted">{fmt(run.started_at)}</td>
              <td>
                <span className={`badge ${run.status}`}>{run.status}</span>
              </td>
              <td>{run.websites_checked}</td>
              <td>{run.crawl_jobs_created}</td>
              <td>{run.stale_recovered}</td>
              <td>{run.jobs_retried}</td>
              <td>{run.jobs_processed}</td>
            </tr>
          ))}
          {recentRuns.length === 0 && (
            <tr>
              <td colSpan={7} className="muted">
                No runs yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <h2>Websites</h2>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Status</th>
            <th>Frequency</th>
            <th>Last crawled</th>
            <th>Next crawl</th>
            <th>Last SEO analysis</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {websiteRows.map(({ website, lastAnalysis }) => (
            <tr key={website.id}>
              <td>{website.name}</td>
              <td>{website.status}</td>
              <td className="muted">every {website.crawl_frequency_days}d</td>
              <td className="muted">{fmt(website.last_crawled_at)}</td>
              <td className="muted">{fmt(website.next_crawl_at)}</td>
              <td className="muted">{fmt(lastAnalysis?.completed_at ?? null)}</td>
              <td>
                <Link className="btn secondary" href={`/admin/websites/${website.id}`}>
                  Open
                </Link>
              </td>
            </tr>
          ))}
          {websiteRows.length === 0 && (
            <tr>
              <td colSpan={7} className="muted">
                No websites yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </>
  );
}
