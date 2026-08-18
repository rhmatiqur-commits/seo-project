import { requireOrganizationMembership } from "@/lib/auth/session";
import { getPrimaryWebsiteForOrganization } from "@/lib/dashboard/website";
import { listSearchConsoleMetricsForWebsiteInRange } from "@/lib/db/search-console";
import { listIssuesForWebsite } from "@/lib/db/audits";
import { listOpportunitiesForWebsite } from "@/lib/db/opportunities";
import { listSeoActionsForWebsite } from "@/lib/db/seo-actions";
import { listLatestOutcomesByActionForWebsite } from "@/lib/db/seo-action-outcomes";
import { EmptyState } from "@/app/dashboard/_components/EmptyState";
import { getComparisonWindow, summarizeSearchConsoleRows, computeDelta, DEFAULT_COMPARISON_WINDOW_DAYS } from "@/lib/dashboard/delta";

export const dynamic = "force-dynamic";

// Phase 7.1C: the current/previous-window comparison this page originated
// now lives in lib/dashboard/delta.ts, shared with the Home page's SEO
// performance section — this file no longer has its own copy of
// summarize/deltaLabel/the date-window math, only this page's own display
// concerns (the "Last N days vs..." subtitle wording).
const WINDOW_DAYS = DEFAULT_COMPARISON_WINDOW_DAYS;

export default async function ReportsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { organization } = await requireOrganizationMembership(orgSlug);
  const website = await getPrimaryWebsiteForOrganization(organization.id);

  if (!website) {
    return (
      <>
        <h1 className="dash-page-title">Reports</h1>
        <EmptyState title="No website configured yet" description="Reports appear once a website has been set up for your organisation." />
      </>
    );
  }

  const comparisonWindow = getComparisonWindow(WINDOW_DAYS);

  const [currentRows, previousRows, issues, opportunities, actions] = await Promise.all([
    listSearchConsoleMetricsForWebsiteInRange(website.id, comparisonWindow.currentStart, comparisonWindow.currentEnd),
    listSearchConsoleMetricsForWebsiteInRange(website.id, comparisonWindow.previousStart, comparisonWindow.previousEnd),
    listIssuesForWebsite(website.id),
    listOpportunitiesForWebsite(website.id),
    listSeoActionsForWebsite(website.id, { status: "EXECUTED" }),
  ]);
  const latestOutcomes = await listLatestOutcomesByActionForWebsite(website.id);

  const current = summarizeSearchConsoleRows(currentRows);
  const previous = summarizeSearchConsoleRows(previousRows);
  const openIssues = issues.filter((i) => i.status === "open");
  const criticalOrHigh = openIssues.filter((i) => i.severity === "critical" || i.severity === "high");
  const openOpportunities = opportunities.filter((o) => o.status === "new");

  let successful = 0;
  let stillMeasuring = 0;
  let needsAttention = 0;
  for (const action of actions) {
    const outcome = latestOutcomes.get(action.id);
    if (!outcome) {
      stillMeasuring++;
    } else if (outcome.classification === "POSITIVE") {
      successful++;
    } else if (outcome.classification === "NEGATIVE" || outcome.classification === "MIXED") {
      needsAttention++;
    } else {
      stillMeasuring++;
    }
  }

  const clicksDelta = computeDelta(current.clicks, previous.clicks);
  const impressionsDelta = computeDelta(current.impressions, previous.impressions);

  return (
    <>
      <h1 className="dash-page-title">Performance report</h1>
      <p className="dash-page-subtitle">
        Last {WINDOW_DAYS} days vs. the {WINDOW_DAYS} days before that.
      </p>

      <div className="dash-grid dash-grid-cols-3" style={{ marginBottom: 28 }}>
        <div className="dash-card stat">
          <div className="dash-stat-label">Clicks</div>
          <div className="dash-stat-value">{current.clicks.toLocaleString()}</div>
          <div className={`dash-stat-delta ${clicksDelta.tone}`}>{clicksDelta.text} vs previous period</div>
        </div>
        <div className="dash-card stat">
          <div className="dash-stat-label">Impressions</div>
          <div className="dash-stat-value">{current.impressions.toLocaleString()}</div>
          <div className={`dash-stat-delta ${impressionsDelta.tone}`}>{impressionsDelta.text} vs previous period</div>
        </div>
        <div className="dash-card stat">
          <div className="dash-stat-label">Average position</div>
          <div className="dash-stat-value">{current.position ?? "-"}</div>
          <div className="dash-muted" style={{ fontSize: "0.82rem" }}>previously {previous.position ?? "-"}</div>
        </div>
      </div>

      <h2 style={{ fontSize: "1rem" }}>SEO actions</h2>
      <div className="dash-grid dash-grid-cols-4" style={{ marginBottom: 28 }}>
        <div className="dash-card stat">
          <div className="dash-stat-label">Completed</div>
          <div className="dash-stat-value">{actions.length}</div>
        </div>
        <div className="dash-card stat">
          <div className="dash-stat-label">Successful</div>
          <div className="dash-stat-value" style={{ color: "var(--dash-success)" }}>{successful}</div>
        </div>
        <div className="dash-card stat">
          <div className="dash-stat-label">Still measuring</div>
          <div className="dash-stat-value">{stillMeasuring}</div>
        </div>
        <div className="dash-card stat">
          <div className="dash-stat-label">Needing attention</div>
          <div className="dash-stat-value" style={{ color: needsAttention > 0 ? "var(--dash-danger)" : undefined }}>{needsAttention}</div>
        </div>
      </div>

      <h2 style={{ fontSize: "1rem" }}>Technical health</h2>
      <div className="dash-grid dash-grid-cols-3">
        <div className="dash-card stat">
          <div className="dash-stat-label">Open opportunities</div>
          <div className="dash-stat-value">{openOpportunities.length}</div>
        </div>
        <div className="dash-card stat">
          <div className="dash-stat-label">Open issues</div>
          <div className="dash-stat-value">{openIssues.length}</div>
        </div>
        <div className="dash-card stat">
          <div className="dash-stat-label">Critical/high issues</div>
          <div className="dash-stat-value" style={{ color: criticalOrHigh.length > 0 ? "var(--dash-danger)" : undefined }}>{criticalOrHigh.length}</div>
        </div>
      </div>
    </>
  );
}
