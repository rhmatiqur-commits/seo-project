import Link from "next/link";
import { requireOrganizationMembership } from "@/lib/auth/session";
import { getPrimaryWebsiteForOrganization } from "@/lib/dashboard/website";
import { getSearchConsoleStatsForWebsite } from "@/lib/db/search-console";
import { listIssuesForWebsite } from "@/lib/db/audits";
import { listOpportunitiesForWebsite } from "@/lib/db/opportunities";
import { listContentJobsForWebsite, listContentBriefsForWebsite, listContentJobsForBrief } from "@/lib/db/content";
import { listPublicationsForWebsite } from "@/lib/db/content-publications";
import { getSeoActionOutcomeStatsForWebsite } from "@/lib/db/seo-action-outcomes";
import { listAlertsForWebsite } from "@/lib/db/seo-alerts";
import { EmptyState } from "@/app/dashboard/_components/EmptyState";
import { contentStatusLabel, publicationStatusLabel } from "@/lib/dashboard/status-labels";

export const dynamic = "force-dynamic";

function fmt(date: string | null): string {
  return date ? new Date(date).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "-";
}

/**
 * Phase 7.1B: recomposed around the three questions the spec asks this
 * page to answer — performance, attention, recent activity — using
 * whitespace/headings/dividers (.dash-section, .dash-list-row) instead of
 * nesting every group in another bordered card, per the visual rule. Every
 * number here already existed somewhere in the Phase 7 dashboard; nothing
 * new is computed, only recomposed. "Active opportunities" now specifically
 * means undecided ("new") opportunities, matching the sidebar's attention
 * count exactly, rather than the old new+approved mix.
 */
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

  const [gscStats, issues, opportunities, pendingApprovals, publications, outcomeStats, alerts, recentBriefs] = await Promise.all([
    getSearchConsoleStatsForWebsite(website.id),
    listIssuesForWebsite(website.id),
    listOpportunitiesForWebsite(website.id),
    listContentJobsForWebsite(website.id, "READY_FOR_APPROVAL"),
    listPublicationsForWebsite(website.id, 5),
    getSeoActionOutcomeStatsForWebsite(website.id),
    listAlertsForWebsite(website.id, { status: "open" }, 5),
    listContentBriefsForWebsite(website.id, 3),
  ]);

  const openIssues = issues.filter((i) => i.status === "open");
  const criticalOrHigh = openIssues.filter((i) => i.severity === "critical" || i.severity === "high");
  const newOpportunities = opportunities.filter((o) => o.status === "new");
  const recentlyAccepted = opportunities
    .filter((o) => o.status === "approved")
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 3);
  const recentContentJobs = await Promise.all(recentBriefs.map(async (b) => ({ brief: b, job: (await listContentJobsForBrief(b.id))[0] ?? null })));

  const needsAttentionCount = newOpportunities.length + pendingApprovals.length + criticalOrHigh.length + alerts.length;

  return (
    <>
      <h1 className="dash-page-title">{website.name}</h1>
      <p className="dash-page-subtitle">Here&apos;s how your SEO is doing and what needs your attention.</p>

      <section className="dash-section">
        <h2 className="dash-section-heading">SEO performance</h2>
        <div className="dash-grid dash-grid-cols-4">
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
          <div className="dash-notice" style={{ marginTop: 16, marginBottom: 0 }}>
            No Google Search Console data yet — connect it from <Link href={`/dashboard/${orgSlug}/settings`}>Settings</Link> to see real performance here.
          </div>
        )}
      </section>

      <hr className="dash-divider" />

      <section className="dash-section">
        <h2 className="dash-section-heading">Needs your attention</h2>
        {needsAttentionCount === 0 ? (
          <p className="dash-muted" style={{ fontSize: "0.9rem" }}>Nothing needs your attention right now — nicely done.</p>
        ) : (
          <div>
            {alerts.map((a) => (
              <div key={a.id} className="dash-list-row">
                <div className="secondary" style={{ color: "var(--dash-warning)" }}>{a.message}</div>
              </div>
            ))}
            {newOpportunities.length > 0 && (
              <Link href={`/dashboard/${orgSlug}/opportunities`} className="dash-list-row" style={{ color: "inherit" }}>
                <div>
                  <div className="primary">Active opportunities</div>
                  <div className="secondary">New SEO opportunities to review</div>
                </div>
                <span className="dash-badge danger">{newOpportunities.length}</span>
              </Link>
            )}
            {pendingApprovals.length > 0 && (
              <Link href={`/dashboard/${orgSlug}/content`} className="dash-list-row" style={{ color: "inherit" }}>
                <div>
                  <div className="primary">Pending your approval</div>
                  <div className="secondary">Content drafts ready for review</div>
                </div>
                <span className="dash-badge warning">{pendingApprovals.length}</span>
              </Link>
            )}
            {criticalOrHigh.length > 0 && (
              <Link href={`/dashboard/${orgSlug}/audit`} className="dash-list-row" style={{ color: "inherit" }}>
                <div>
                  <div className="primary">SEO issues</div>
                  <div className="secondary">Critical or high-severity issues found in your last audit</div>
                </div>
                <span className="dash-badge danger">{criticalOrHigh.length}</span>
              </Link>
            )}
          </div>
        )}
      </section>

      <hr className="dash-divider" />

      <section className="dash-section">
        <h2 className="dash-section-heading">Recent activity</h2>

        {recentlyAccepted.length > 0 && (
          <>
            <h3 className="dash-subsection-heading">Recently accepted opportunities</h3>
            {recentlyAccepted.map((o) => (
              <div key={o.id} className="dash-list-row">
                <div className="primary">{o.title}</div>
                <div className="secondary">{fmt(o.updated_at)}</div>
              </div>
            ))}
          </>
        )}

        {recentContentJobs.length > 0 && (
          <>
            <h3 className="dash-subsection-heading">Content actions</h3>
            {recentContentJobs.map(({ brief, job }) => (
              <Link key={brief.id} href={`/dashboard/${orgSlug}/content/${brief.id}`} className="dash-list-row" style={{ color: "inherit" }}>
                <div className="primary">{brief.target_url ?? brief.primary_keyword ?? "Untitled brief"}</div>
                <span className={`dash-badge ${job ? "info" : "neutral"}`}>{job ? contentStatusLabel(job.status) : "Not started"}</span>
              </Link>
            ))}
          </>
        )}

        <h3 className="dash-subsection-heading">Publications</h3>
        {publications.length === 0 && (
          <EmptyState title="Nothing published yet" description="Publications appear here once a piece of approved content is prepared for your site." />
        )}
        {publications.map((p) => (
          <div key={p.id} className="dash-list-row">
            <div className="primary">{p.target_url ?? "Untitled page"}</div>
            <div style={{ textAlign: "right" }}>
              <span className={`dash-badge ${p.status === "PUBLISHED" ? "success" : "info"}`}>{publicationStatusLabel(p.status)}</span>
              <div className="secondary">{fmt(p.updated_at)}</div>
            </div>
          </div>
        ))}
        <p style={{ marginTop: 10 }}>
          <Link href={`/dashboard/${orgSlug}/publishing`}>View all publishing &rarr;</Link>
        </p>

        <h3 className="dash-subsection-heading">Outcomes</h3>
        <p className="dash-muted" style={{ fontSize: "0.85rem" }}>
          {outcomeStats.totalOutcomes} measured result{outcomeStats.totalOutcomes === 1 ? "" : "s"} so far.
        </p>
        <div style={{ display: "flex", gap: 24, marginTop: 8 }}>
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
      </section>
    </>
  );
}
