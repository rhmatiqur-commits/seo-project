import Link from "next/link";
import { requireOrganizationMembership } from "@/lib/auth/session";
import { getPrimaryWebsiteForOrganization } from "@/lib/dashboard/website";
import { getSearchConsoleConnection, getSearchConsoleStatsForWebsite, listSearchConsoleMetricsForWebsiteInRange } from "@/lib/db/search-console";
import { listIssuesForWebsite } from "@/lib/db/audits";
import { listOpportunitiesForWebsite } from "@/lib/db/opportunities";
import { listContentJobsForWebsite, listContentBriefsForWebsite, listContentJobsForBrief } from "@/lib/db/content";
import { listPublicationsForWebsite } from "@/lib/db/content-publications";
import { getSeoActionOutcomeStatsForWebsite } from "@/lib/db/seo-action-outcomes";
import { listAlertsForWebsite } from "@/lib/db/seo-alerts";
import { EmptyState } from "@/app/dashboard/_components/EmptyState";
import { AttentionList } from "@/app/dashboard/_components/AttentionList";
import { DeltaStat } from "@/app/dashboard/_components/DeltaStat";
import { contentStatusLabel, publicationStatusLabel } from "@/lib/dashboard/status-labels";
import { buildAttentionItems } from "@/lib/dashboard/attention";
import { getComparisonWindow, summarizeSearchConsoleRows, computeDelta } from "@/lib/dashboard/delta";
import { getSearchConsoleDisplayState } from "@/lib/dashboard/search-console-state";
import { buildOutcomeSummary } from "@/lib/dashboard/outcome-summary";

export const dynamic = "force-dynamic";

function fmt(date: string | null): string {
  return date ? new Date(date).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "-";
}

/**
 * Phase 7.1C: reordered around urgency — Needs your attention, SEO
 * performance, Results, Recent activity — per the approved proposal.
 * Every number still comes from an existing lib/db service; the only new
 * *query* is listSearchConsoleMetricsForWebsiteInRange for the current/
 * previous 28-day comparison, which Reports has already been running since
 * Phase 7 (lifted into lib/dashboard/delta.ts so both pages share one
 * implementation, not two).
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

  const comparisonWindow = getComparisonWindow();

  const [connection, gscStats, currentRows, previousRows, issues, opportunities, pendingApprovalContentJobs, publications, outcomeStats, alerts, recentBriefs] =
    await Promise.all([
      getSearchConsoleConnection(website.id),
      getSearchConsoleStatsForWebsite(website.id),
      listSearchConsoleMetricsForWebsiteInRange(website.id, comparisonWindow.currentStart, comparisonWindow.currentEnd),
      listSearchConsoleMetricsForWebsiteInRange(website.id, comparisonWindow.previousStart, comparisonWindow.previousEnd),
      listIssuesForWebsite(website.id),
      listOpportunitiesForWebsite(website.id),
      listContentJobsForWebsite(website.id, "READY_FOR_APPROVAL"),
      // Unfiltered/unlimited (default 50) — reused below both for the
      // "awaiting production approval" attention count (which needs every
      // matching row, not just the 5 most recent) and for the Recent
      // Activity feed's first 5, since the list is already updated_at-desc.
      listPublicationsForWebsite(website.id),
      getSeoActionOutcomeStatsForWebsite(website.id),
      listAlertsForWebsite(website.id, { status: "open" }, 5),
      listContentBriefsForWebsite(website.id, 3),
    ]);

  const recentContentJobs = await Promise.all(recentBriefs.map(async (b) => ({ brief: b, job: (await listContentJobsForBrief(b.id))[0] ?? null })));

  const attentionItems = buildAttentionItems({ orgSlug, opportunities, issues, pendingApprovalContentJobs, publications, alerts });

  const searchConsoleState = getSearchConsoleDisplayState(connection?.status, gscStats.totalRows);
  const current = summarizeSearchConsoleRows(currentRows);
  const previous = summarizeSearchConsoleRows(previousRows);
  const currentCtr = current.impressions > 0 ? (current.clicks / current.impressions) * 100 : 0;
  const previousCtr = previous.impressions > 0 ? (previous.clicks / previous.impressions) * 100 : 0;

  const outcomeSummary = buildOutcomeSummary(outcomeStats.byClassification);

  const recentlyAccepted = opportunities
    .filter((o) => o.status === "approved")
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 3);
  const recentPublications = publications.slice(0, 5);

  return (
    <>
      <h1 className="dash-page-title">{website.name}</h1>
      <p className="dash-page-subtitle">Your SEO performance, opportunities and results in one place.</p>

      <section className="dash-section">
        <h2 className="dash-section-heading">Needs your attention</h2>
        <AttentionList items={attentionItems} />
      </section>

      <hr className="dash-divider" />

      <section className="dash-section">
        <h2 className="dash-section-heading">SEO performance</h2>

        {searchConsoleState === "NOT_CONNECTED" && (
          <EmptyState
            title="Connect Google Search Console"
            description="Google Search Console provides your site's real clicks, impressions, and ranking position, straight from Google — connect it to see actual performance here instead of an empty page."
            action={
              <Link className="dash-btn" href={`/dashboard/${orgSlug}/settings`}>
                Go to Settings to connect
              </Link>
            }
          />
        )}

        {searchConsoleState === "CONNECTED_NO_DATA" && (
          <EmptyState
            title="Search Console is connected — data is on its way"
            description="Google Search Console data usually takes a couple of days to start appearing after connecting. Nothing further is needed on your side."
          />
        )}

        {searchConsoleState === "CONNECTED_WITH_DATA" && (
          <div className="dash-grid dash-grid-cols-4">
            <DeltaStat label="Organic clicks" value={current.clicks.toLocaleString()} delta={computeDelta(current.clicks, previous.clicks)} />
            <DeltaStat label="Impressions" value={current.impressions.toLocaleString()} delta={computeDelta(current.impressions, previous.impressions)} />
            <DeltaStat
              label="Average position"
              value={current.position !== null ? String(current.position) : "-"}
              helper={`previously ${previous.position !== null ? previous.position : "-"}`}
            />
            <DeltaStat label="CTR" value={`${Math.round(currentCtr * 10) / 10}%`} delta={computeDelta(currentCtr, previousCtr)} />
          </div>
        )}
      </section>

      <hr className="dash-divider" />

      <section className="dash-section">
        <h2 className="dash-section-heading">Results</h2>
        <p className="dash-muted" style={{ fontSize: "0.85rem", marginTop: -10, marginBottom: 16, maxWidth: "60ch" }}>
          What happened after each completed SEO action, measured against real Search Console data — never a claim that the action alone caused it.
        </p>

        {outcomeStats.totalOutcomes === 0 ? (
          <EmptyState
            title="No results measured yet"
            description="No published or eligible SEO actions have been measured yet — the platform needs time after an action before it can observe a change. Results will appear here as completed actions are measured."
          />
        ) : (
          <div className="dash-grid dash-grid-cols-4">
            {outcomeSummary.map((g) => (
              <div key={g.key} className="dash-card stat">
                <div className="dash-stat-label">{g.label}</div>
                <div className="dash-stat-value">{g.count}</div>
              </div>
            ))}
          </div>
        )}
        <p style={{ marginTop: 10 }}>
          <Link href={`/dashboard/${orgSlug}/outcomes`}>View all outcomes &rarr;</Link>
        </p>
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
            <h3 className="dash-subsection-heading">Recently started content</h3>
            {recentContentJobs.map(({ brief, job }) => (
              <Link key={brief.id} href={`/dashboard/${orgSlug}/content/${brief.id}`} className="dash-list-row" style={{ color: "inherit" }}>
                <div className="primary">{brief.target_url ?? brief.primary_keyword ?? "Untitled brief"}</div>
                <span className={`dash-badge ${job ? "info" : "neutral"}`}>{job ? contentStatusLabel(job.status) : "Not started"}</span>
              </Link>
            ))}
          </>
        )}

        <h3 className="dash-subsection-heading">Recently published</h3>
        {recentPublications.length === 0 ? (
          <EmptyState title="Nothing published yet" description="Publications appear here once a piece of approved content is prepared for your site." />
        ) : (
          recentPublications.map((p) => (
            <div key={p.id} className="dash-list-row">
              <div className="primary">{p.target_url ?? "Untitled page"}</div>
              <div style={{ textAlign: "right" }}>
                <span className={`dash-badge ${p.status === "PUBLISHED" ? "success" : "info"}`}>{publicationStatusLabel(p.status)}</span>
                <div className="secondary">{fmt(p.updated_at)}</div>
              </div>
            </div>
          ))
        )}
        <p style={{ marginTop: 10 }}>
          <Link href={`/dashboard/${orgSlug}/publishing`}>View all publishing &rarr;</Link>
        </p>
      </section>
    </>
  );
}
