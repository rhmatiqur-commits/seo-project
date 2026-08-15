import Link from "next/link";
import { notFound } from "next/navigation";
import { getWebsite } from "@/lib/db/websites";
import { getSearchConsoleConnection, getSearchConsoleStatsForWebsite, listSearchConsoleMetricsForWebsite } from "@/lib/db/search-console";
import { listSites } from "@/lib/search-console/client";
import { listJobsForWebsite } from "@/lib/db/jobs";
import { triggerSearchConsoleSyncAction, selectSearchConsoleSiteAction, disconnectSearchConsoleAction } from "@/app/admin/actions";

export const dynamic = "force-dynamic";

function fmt(date: string | null): string {
  return date ? new Date(date).toLocaleString() : "-";
}

export default async function WebsiteSearchConsolePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const website = await getWebsite(id);
  if (!website) notFound();

  const connection = await getSearchConsoleConnection(website.id);
  const jobs = await listJobsForWebsite(website.id, 5);
  const syncJobs = jobs.filter((j) => j.job_type === "SEARCH_CONSOLE_SYNC");

  return (
    <>
      <p>
        <Link href={`/admin/websites/${website.id}`}>&larr; {website.name}</Link>
      </p>
      <h1>Search Console — {website.name}</h1>

      <div className="notice">
        Actual Google Search Console data — real clicks, impressions, CTR, and average position as reported by
        Google, not AI-derived or estimated. This is the platform&apos;s first external/measured data source.
      </div>

      {!connection && (
        <div className="card row">
          <a className="btn" href={`/api/auth/google-search-console/start?website_id=${website.id}`}>
            Connect Search Console
          </a>
          <span className="muted">Redirects to Google to authorize read-only access to this website&apos;s Search Console data.</span>
        </div>
      )}

      {connection && connection.status === "pending_site_selection" && (
        <SitePicker websiteId={website.id} accessToken={connection.access_token} />
      )}

      {connection && connection.status === "error" && (
        <div className="card">
          <p className="badge critical">Connection error</p>
          <p className="muted">{connection.last_sync_error}</p>
          <div className="row">
            <a className="btn" href={`/api/auth/google-search-console/start?website_id=${website.id}`}>
              Reconnect
            </a>
            <form action={disconnectSearchConsoleAction}>
              <input type="hidden" name="website_id" value={website.id} />
              <button className="btn secondary" type="submit">
                Disconnect
              </button>
            </form>
          </div>
        </div>
      )}

      {connection && connection.status === "active" && (
        <ActiveConnection websiteId={website.id} organizationId={website.organization_id} siteUrl={connection.site_url!} />
      )}

      <h2>Recent sync jobs</h2>
      <table>
        <thead>
          <tr>
            <th>Status</th>
            <th>Created</th>
            <th>Completed</th>
            <th>Error</th>
          </tr>
        </thead>
        <tbody>
          {syncJobs.map((job) => (
            <tr key={job.id}>
              <td>
                <span className={`badge ${job.status}`}>{job.status}</span>
              </td>
              <td className="muted">{fmt(job.created_at)}</td>
              <td className="muted">{fmt(job.completed_at)}</td>
              <td className="muted">{job.error ?? ""}</td>
            </tr>
          ))}
          {syncJobs.length === 0 && (
            <tr>
              <td colSpan={4} className="muted">
                No Search Console sync jobs run yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </>
  );
}

async function SitePicker({ websiteId, accessToken }: { websiteId: string; accessToken: string | null }) {
  if (!accessToken) {
    return <p className="notice">No access token stored — try reconnecting.</p>;
  }

  let sites: Awaited<ReturnType<typeof listSites>> = [];
  let loadError: string | null = null;
  try {
    sites = await listSites(accessToken);
  } catch (error) {
    loadError = error instanceof Error ? error.message : String(error);
  }

  return (
    <div className="card">
      <h2>Choose a Search Console property</h2>
      <p className="muted">Your Google account may have access to several verified properties — pick the one for this website.</p>
      {loadError && <p className="notice">Could not list properties: {loadError}</p>}
      {!loadError && sites.length === 0 && <p className="muted">No verified Search Console properties found on this Google account.</p>}
      {!loadError && sites.length > 0 && (
        <form action={selectSearchConsoleSiteAction} className="row">
          <input type="hidden" name="website_id" value={websiteId} />
          <select name="site_url" defaultValue="">
            <option value="" disabled>
              Select a property
            </option>
            {sites.map((s) => (
              <option key={s.siteUrl} value={s.siteUrl}>
                {s.siteUrl} ({s.permissionLevel})
              </option>
            ))}
          </select>
          <button className="btn" type="submit">
            Connect this property
          </button>
        </form>
      )}
    </div>
  );
}

async function ActiveConnection({ websiteId, organizationId, siteUrl }: { websiteId: string; organizationId: string; siteUrl: string }) {
  const [stats, metrics] = await Promise.all([
    getSearchConsoleStatsForWebsite(websiteId),
    listSearchConsoleMetricsForWebsite(websiteId, 50),
  ]);

  return (
    <>
      <div className="card row">
        <form action={triggerSearchConsoleSyncAction}>
          <input type="hidden" name="website_id" value={websiteId} />
          <input type="hidden" name="organization_id" value={organizationId} />
          <button className="btn" type="submit">
            Sync now
          </button>
        </form>
        <form action={disconnectSearchConsoleAction}>
          <input type="hidden" name="website_id" value={websiteId} />
          <button className="btn secondary" type="submit">
            Disconnect
          </button>
        </form>
        <span className="muted">Connected property: {siteUrl}</span>
      </div>

      <h2>Overview ({stats.earliestDate ?? "-"} to {stats.latestDate ?? "-"})</h2>
      <table>
        <thead>
          <tr>
            <th>Rows</th>
            <th>Total clicks</th>
            <th>Total impressions</th>
            <th>Average position</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{stats.totalRows}</td>
            <td>{stats.totalClicks}</td>
            <td>{stats.totalImpressions}</td>
            <td>{stats.averagePosition ?? "-"}</td>
          </tr>
        </tbody>
      </table>

      <h2>Top rows by clicks ({metrics.length})</h2>
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Query</th>
            <th>Page</th>
            <th>Clicks</th>
            <th>Impressions</th>
            <th>CTR</th>
            <th>Position</th>
          </tr>
        </thead>
        <tbody>
          {metrics.map((m) => (
            <tr key={m.id}>
              <td className="muted">{m.date}</td>
              <td>{m.query ?? <span className="muted">-</span>}</td>
              <td className="muted">{m.page_url ?? "-"}</td>
              <td>{m.clicks}</td>
              <td>{m.impressions}</td>
              <td>{(m.ctr * 100).toFixed(2)}%</td>
              <td>{m.position ?? "-"}</td>
            </tr>
          ))}
          {metrics.length === 0 && (
            <tr>
              <td colSpan={7} className="muted">
                No data synced yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </>
  );
}
