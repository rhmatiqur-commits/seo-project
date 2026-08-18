import { requireOrganizationMembership } from "@/lib/auth/session";
import { getPrimaryWebsiteForOrganization } from "@/lib/dashboard/website";
import { getSearchConsoleStatsForWebsite, listSearchConsoleMetricsForWebsite } from "@/lib/db/search-console";
import { getSearchConsoleConnection } from "@/lib/db/search-console";

export const dynamic = "force-dynamic";

function fmt(date: string | null): string {
  return date ? new Date(date).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "-";
}

export default async function SearchConsolePage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { organization } = await requireOrganizationMembership(orgSlug);
  const website = await getPrimaryWebsiteForOrganization(organization.id);
  const [connection, stats, rows] = website
    ? await Promise.all([getSearchConsoleConnection(website.id), getSearchConsoleStatsForWebsite(website.id), listSearchConsoleMetricsForWebsite(website.id, 50)])
    : [null, null, []];

  return (
    <>
      <h1 className="dash-page-title">Search Console</h1>
      <p className="dash-page-subtitle">Actual Google Search Console data for your site — not an estimate.</p>

      {(!connection || connection.status !== "active") && (
        <div className="dash-notice warning">
          Google Search Console isn&apos;t connected yet — contact your account manager to connect it.
        </div>
      )}

      {stats && stats.totalRows > 0 && (
        <div className="dash-grid dash-grid-cols-4" style={{ marginBottom: 24 }}>
          <div className="dash-card">
            <div className="dash-stat-label">Clicks</div>
            <div className="dash-stat-value">{stats.totalClicks.toLocaleString()}</div>
          </div>
          <div className="dash-card">
            <div className="dash-stat-label">Impressions</div>
            <div className="dash-stat-value">{stats.totalImpressions.toLocaleString()}</div>
          </div>
          <div className="dash-card">
            <div className="dash-stat-label">Average position</div>
            <div className="dash-stat-value">{stats.averagePosition ?? "-"}</div>
          </div>
          <div className="dash-card">
            <div className="dash-stat-label">Data since</div>
            <div className="dash-stat-value" style={{ fontSize: "1.1rem" }}>
              {fmt(stats.earliestDate)}
            </div>
          </div>
        </div>
      )}

      <h2 style={{ fontSize: "1rem" }}>Top queries &amp; pages</h2>
      <div className="dash-notice" style={{ marginBottom: 12 }}>
        Real Google Search Console data — clicks, impressions, position.
      </div>
      {rows.length === 0 && <p className="dash-empty">No Search Console data yet.</p>}
      <table className="dash-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Query</th>
            <th>Page</th>
            <th>Clicks</th>
            <th>Impressions</th>
            <th>Position</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="dash-muted">{fmt(r.date)}</td>
              <td>{r.query ?? "-"}</td>
              <td className="dash-muted">{r.page_url ?? "-"}</td>
              <td>{r.clicks}</td>
              <td className="dash-muted">{r.impressions}</td>
              <td className="dash-muted">{r.position !== null ? Math.round(r.position * 10) / 10 : "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
