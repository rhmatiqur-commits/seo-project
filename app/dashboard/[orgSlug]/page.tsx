import Link from "next/link";
import { requireOrganizationMembership } from "@/lib/auth/session";
import { getPrimaryWebsiteForOrganization } from "@/lib/dashboard/website";
import { getSearchConsoleStatsForWebsite } from "@/lib/db/search-console";
import { listIssuesForWebsite } from "@/lib/db/audits";
import { listOpportunitiesForWebsite } from "@/lib/db/opportunities";
import { listContentJobsForWebsite } from "@/lib/db/content";
import { listPublicationsForWebsite } from "@/lib/db/content-publications";
import { getSeoActionOutcomeStatsForWebsite } from "@/lib/db/seo-action-outcomes";
import { listAlertsForWebsite } from "@/lib/db/seo-alerts";
import { EmptyState } from "@/app/dashboard/_components/EmptyState";

export const dynamic = "force-dynamic";

function fmt(date: string | null): string {
  return date ? new Date(date).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "-";
}

export default async function OrganizationHomePage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { organization } = await requireOrganizationMembership(orgSlug);
  const website = await getPrimaryWebsiteForOrganization(organization.id);

  if (!website) {
    return (
      <>
        <h1 className="dash-page-title">Welcome to {organization.name}</h1>
        <p className="dash-muted">No website has been set up for your organisation yet — contact your account manager.</p>
      </>
    );
  }

  const [gscStats, issues, opportunities, pendingApprovals, publications, outcomeStats, alerts] = await Promise.all([
    getSearchConsoleStatsForWebsite(website.id),
    listIssuesForWebsite(website.id),
    listOpportunitiesForWebsite(website.id),
    listContentJobsForWebsite(website.id, "READY_FOR_APPROVAL"),
    listPublicationsForWebsite(website.id, 5),
    getSeoActionOutcomeStatsForWebsite(website.id),
    listAlertsForWebsite(website.id, { status: "open" }, 5),
  ]);

  const openIssues = issues.filter((i) => i.status === "open");
  const criticalOrHigh = openIssues.filter((i) => i.severity === "critical" || i.severity === "high");
  const openOpportunities = opportunities.filter((o) => o.status === "new" || o.status === "approved");

  return (
    <>
      <h1 className="dash-page-title">{website.name}</h1>
      <p className="dash-page-subtitle">Here&apos;s how your SEO is doing and what needs your attention.</p>

      <div className="dash-grid dash-grid-cols-4" style={{ marginBottom: 24 }}>
        <div className="dash-card stat">
          <div className="dash-stat-label">Organic clicks</div>
          <div className="dash-stat-value">{gscStats.totalClicks.toLocaleString()}</div>
        </div>
        <div className="dash-card stat">
          <div className="dash-stat-label">Impressions</div>
          <div className="dash-stat-value">{gscStats.totalImpressions.toLocaleString()}</div>
        </div>
        <div className="dash-card stat">
          <div className="dash-stat-label">Average position</div>
          <div className="dash-stat-value">{gscStats.averagePosition ?? "-"}</div>
        </div>
        <div className="dash-card stat">
          <div className="dash-stat-label">CTR</div>
          <div className="dash-stat-value">{gscStats.totalImpressions > 0 ? `${Math.round((gscStats.totalClicks / gscStats.totalImpressions) * 1000) / 10}%` : "-"}</div>
        </div>
      </div>
      {gscStats.totalRows === 0 && (
        <div className="dash-notice">
          No Google Search Console data yet — connect it from <Link href={`/dashboard/${orgSlug}/settings`}>Settings</Link> to see real performance here.
        </div>
      )}

      {alerts.length > 0 && (
        <div className="dash-card" style={{ marginBottom: 24 }}>
          <h2 style={{ marginTop: 0, fontSize: "1rem" }}>Needs your attention</h2>
          {alerts.map((a) => (
            <div key={a.id} className="dash-notice warning" style={{ marginBottom: 8 }}>
              {a.message}
            </div>
          ))}
        </div>
      )}

      <div className="dash-grid dash-grid-cols-3" style={{ marginBottom: 24 }}>
        <Link href={`/dashboard/${orgSlug}/opportunities`} className="dash-card stat interactive">
          <div className="dash-stat-label">Active opportunities</div>
          <div className="dash-stat-value">{openOpportunities.length}</div>
        </Link>
        <Link href={`/dashboard/${orgSlug}/content`} className="dash-card stat interactive">
          <div className="dash-stat-label">Pending your approval</div>
          <div className="dash-stat-value">{pendingApprovals.length}</div>
        </Link>
        <Link href={`/dashboard/${orgSlug}/audit`} className="dash-card stat interactive">
          <div className="dash-stat-label">Issues needing attention</div>
          <div className="dash-stat-value">{criticalOrHigh.length}</div>
        </Link>
      </div>

      <div className="dash-grid dash-grid-cols-2">
        <div className="dash-card">
          <h2 style={{ marginTop: 0, fontSize: "1rem" }}>Recent publications</h2>
          {publications.length === 0 && (
            <EmptyState title="Nothing published yet" description="Publications appear here once a piece of approved content is prepared for your site." />
          )}
          {publications.map((p) => (
            <div key={p.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--dash-border)" }}>
              <div style={{ fontSize: "0.85rem", fontWeight: 600 }}>{p.target_url ?? "Untitled page"}</div>
              <div className="dash-muted" style={{ fontSize: "0.78rem" }}>
                <span className={`dash-badge ${p.status === "PUBLISHED" ? "success" : "info"}`}>{p.status.replace(/_/g, " ")}</span> &middot; {fmt(p.updated_at)}
              </div>
            </div>
          ))}
          <p style={{ marginTop: 10 }}>
            <Link href={`/dashboard/${orgSlug}/publishing`}>View all publishing &rarr;</Link>
          </p>
        </div>
        <div className="dash-card">
          <h2 style={{ marginTop: 0, fontSize: "1rem" }}>SEO outcomes</h2>
          <p className="dash-muted" style={{ fontSize: "0.85rem" }}>
            {outcomeStats.totalOutcomes} measured result{outcomeStats.totalOutcomes === 1 ? "" : "s"} so far.
          </p>
          <div className="dash-row" style={{ display: "flex", gap: 16, marginTop: 8 }}>
            <div>
              <div className="dash-stat-label">Positive</div>
              <div className="dash-stat-value" style={{ fontSize: "1.2rem" }}>
                {outcomeStats.byClassification.POSITIVE ?? 0}
              </div>
            </div>
            <div>
              <div className="dash-stat-label">Needs review</div>
              <div className="dash-stat-value" style={{ fontSize: "1.2rem" }}>
                {outcomeStats.actionsNeedingAttention}
              </div>
            </div>
          </div>
          <p style={{ marginTop: 10 }}>
            <Link href={`/dashboard/${orgSlug}/outcomes`}>View all outcomes &rarr;</Link>
          </p>
        </div>
      </div>
    </>
  );
}
