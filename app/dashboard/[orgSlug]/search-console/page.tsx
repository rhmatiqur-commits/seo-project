import Link from "next/link";
import { requireOrganizationMembership } from "@/lib/auth/session";
import { getPrimaryWebsiteForOrganization } from "@/lib/dashboard/website";
import { getSearchConsoleStatsForWebsite, listSearchConsoleMetricsForWebsite } from "@/lib/db/search-console";
import { getSearchConsoleConnection } from "@/lib/db/search-console";
import { canManageIntegrations } from "@/lib/auth/permissions";
import { EmptyState } from "@/app/dashboard/_components/EmptyState";

export const dynamic = "force-dynamic";

function fmt(date: string | null): string {
  return date ? new Date(date).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "-";
}

export default async function SearchConsolePage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { organization, membership } = await requireOrganizationMembership(orgSlug);
  const website = await getPrimaryWebsiteForOrganization(organization.id);
  const [connection, stats, rows] = website
    ? await Promise.all([getSearchConsoleConnection(website.id), getSearchConsoleStatsForWebsite(website.id), listSearchConsoleMetricsForWebsite(website.id, 50)])
    : [null, null, []];
  const isConnected = connection?.status === "active";
  const canConnect = canManageIntegrations(membership.role);

  return (
    <>
      <h1 className="dash-page-title">Search Console</h1>
      <p className="dash-page-subtitle">Actual Google Search Console data for your site — not an estimate.</p>

      {!isConnected && (
        <div className="dash-empty-state" style={{ textAlign: "left", padding: "var(--dash-space-6) 0" }}>
          <h3 style={{ marginBottom: 10 }}>Connect Google Search Console</h3>
          <div style={{ display: "grid", gap: 16, maxWidth: 640 }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: "0.88rem", marginBottom: 2 }}>What it provides</div>
              <p className="dash-muted" style={{ fontSize: "0.88rem", margin: 0 }}>Real clicks, impressions, and average ranking position for your site, straight from Google — not an estimate from a third-party tool.</p>
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: "0.88rem", marginBottom: 2 }}>Why it matters</div>
              <p className="dash-muted" style={{ fontSize: "0.88rem", margin: 0 }}>Every SEO decision this platform makes — and every outcome it reports — is grounded in this real search data, not a guess.</p>
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: "0.88rem", marginBottom: 2 }}>What happens after connecting</div>
              <p className="dash-muted" style={{ fontSize: "0.88rem", margin: 0 }}>Data starts appearing here automatically on its normal daily schedule — no further setup on your side.</p>
            </div>
          </div>
          {canConnect ? (
            <p style={{ marginTop: 18 }}>
              <Link className="dash-btn" href={`/dashboard/${orgSlug}/settings`}>
                Go to Settings to connect
              </Link>
            </p>
          ) : (
            <p className="dash-muted" style={{ marginTop: 18 }}>
              Not connected yet — ask an Owner on your team to connect Google Search Console from Settings.
            </p>
          )}
        </div>
      )}

      {isConnected && stats && stats.totalRows === 0 && (
        <EmptyState
          title="Search Console is connected — data is on its way"
          description="Google Search Console data usually takes a couple of days to start appearing after connecting. Nothing further is needed on your side."
        />
      )}

      {isConnected && stats && stats.totalRows > 0 && (
        <>
          <p className="dash-muted" style={{ fontSize: "0.85rem", marginBottom: 8 }}>
            All-time totals, since {fmt(stats.earliestDate)} — for a 28-day comparison, see{" "}
            <Link href={`/dashboard/${orgSlug}/reports`}>Reports</Link>.
          </p>
          <div className="dash-grid dash-grid-cols-4" style={{ marginBottom: 24 }}>
            <div className="dash-card stat">
              <div className="dash-stat-label">Clicks (all-time)</div>
              <div className="dash-stat-value">{stats.totalClicks.toLocaleString()}</div>
            </div>
            <div className="dash-card stat">
              <div className="dash-stat-label">Impressions (all-time)</div>
              <div className="dash-stat-value">{stats.totalImpressions.toLocaleString()}</div>
            </div>
            <div className="dash-card stat">
              <div className="dash-stat-label">Average position (all-time)</div>
              <div className="dash-stat-value">{stats.averagePosition ?? "-"}</div>
            </div>
            <div className="dash-card stat">
              <div className="dash-stat-label">Data since</div>
              <div className="dash-stat-value" style={{ fontSize: "1.1rem" }}>
                {fmt(stats.earliestDate)}
              </div>
            </div>
          </div>

          <h2 className="dash-section-heading">Top queries &amp; pages</h2>
          <p className="dash-muted" style={{ fontSize: "0.85rem", marginBottom: 12 }}>
            Showing the latest {rows.length} row{rows.length === 1 ? "" : "s"} of real Search Console data.
          </p>
          <div className="dash-table-wrap">
            <table className="dash-table responsive">
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
                    <td className="dash-muted" data-label="Date">{fmt(r.date)}</td>
                    <td data-label="Query">{r.query ?? "-"}</td>
                    <td className="dash-muted" data-label="Page">{r.page_url ?? "-"}</td>
                    <td data-label="Clicks">{r.clicks}</td>
                    <td className="dash-muted" data-label="Impressions">{r.impressions}</td>
                    <td className="dash-muted" data-label="Position">{r.position !== null ? Math.round(r.position * 10) / 10 : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
