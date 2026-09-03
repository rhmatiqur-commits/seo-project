import Link from "next/link";
import { requireOrganizationMembership } from "@/lib/auth/session";
import { canManageIntegrations } from "@/lib/auth/permissions";
import { getPrimaryWebsiteForOrganization } from "@/lib/dashboard/website";
import { getSearchConsoleConnection, listSearchConsoleMetricsForWebsiteInRange } from "@/lib/db/search-console";
import { listIssuesForWebsite } from "@/lib/db/audits";
import { listOpportunitiesForWebsite } from "@/lib/db/opportunities";
import { listSeoActionsForWebsite } from "@/lib/db/seo-actions";
import { listLatestOutcomesByActionForWebsite } from "@/lib/db/seo-action-outcomes";
import { EmptyState } from "@/app/dashboard/_components/EmptyState";
import { DeltaStat } from "@/app/dashboard/_components/DeltaStat";
import { TrendChart } from "@/app/dashboard/_components/TrendChart";
import {
  getComparisonWindow,
  summarizeSearchConsoleRows,
  computeDelta,
  buildDailySearchConsoleSeries,
  DEFAULT_COMPARISON_WINDOW_DAYS,
  type DeltaResult,
} from "@/lib/dashboard/delta";

/** Phase 7.2I: one plain-language sentence per trend chart, built from the
 * exact same DeltaResult the stat card above it already shows — no new
 * classification logic, just describing the number that's already there in
 * words instead of only a coloured arrow. */
function trendSentence(metricLabel: string, delta: DeltaResult): string {
  if (delta.text === "-") return `No ${metricLabel.toLowerCase()} recorded in this window yet.`;
  if (delta.text === "New") return `${metricLabel} are new this period — nothing recorded in the previous ${DEFAULT_COMPARISON_WINDOW_DAYS} days.`;
  if (delta.tone === "up") return `${metricLabel} are trending up — ${delta.text} vs. the previous ${DEFAULT_COMPARISON_WINDOW_DAYS} days.`;
  if (delta.tone === "down") return `${metricLabel} are trending down — ${delta.text} vs. the previous ${DEFAULT_COMPARISON_WINDOW_DAYS} days.`;
  return `${metricLabel} are flat — no meaningful change vs. the previous ${DEFAULT_COMPARISON_WINDOW_DAYS} days.`;
}

export const dynamic = "force-dynamic";

/**
 * Phase 7.1F: this page answers "how is the website performing over
 * time?" — a website-wide, period-over-period snapshot. Outcomes answers
 * a different question, "what happened after specific SEO work?" (per-
 * action results). The two pages used to overlap enough, with similar-
 * looking numbers and no cross-reference, that a client had no way to
 * tell which one to check first — this adds an explicit pointer, and now
 * shares its window/delta math with Home via lib/dashboard/delta.ts
 * instead of a second, drifting local copy of the same calculation.
 */
export default async function ReportsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { organization, membership } = await requireOrganizationMembership(orgSlug);
  const website = await getPrimaryWebsiteForOrganization(organization.id);
  const canConnectSearchConsole = canManageIntegrations(membership.role);

  if (!website) {
    return (
      <>
        <h1 className="dash-page-title">Reports</h1>
        <EmptyState title="No website configured yet" description="Reports appear once a website has been set up for your organisation." />
      </>
    );
  }

  const comparisonWindow = getComparisonWindow(new Date());

  const [connection, currentRows, previousRows, issues, opportunities, actions] = await Promise.all([
    getSearchConsoleConnection(website.id),
    listSearchConsoleMetricsForWebsiteInRange(website.id, comparisonWindow.currentStart, comparisonWindow.currentEnd),
    listSearchConsoleMetricsForWebsiteInRange(website.id, comparisonWindow.previousStart, comparisonWindow.previousEnd),
    listIssuesForWebsite(website.id),
    listOpportunitiesForWebsite(website.id),
    listSeoActionsForWebsite(website.id, { status: "EXECUTED" }),
  ]);
  const isSearchConsoleConnected = connection?.status === "active";
  const hasSearchConsoleData = currentRows.length > 0 || previousRows.length > 0;
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

  // Phase 7.2I: same currentRows already fetched for the stat cards above —
  // no new query, just a different presentation of it.
  const dailySeries = buildDailySearchConsoleSeries(currentRows, comparisonWindow.currentStart, comparisonWindow.currentEnd);
  const latestSyncedDate = currentRows.reduce<string | null>((max, r) => (max === null || r.date > max ? r.date : max), null);

  return (
    <>
      <h1 className="dash-page-title">Reports</h1>
      <p className="dash-page-subtitle">
        How your website is performing over time — last {DEFAULT_COMPARISON_WINDOW_DAYS} days vs. the {DEFAULT_COMPARISON_WINDOW_DAYS} days before that.
      </p>
      <p className="dash-muted" style={{ fontSize: "0.85rem", marginTop: -8, marginBottom: 20 }}>
        Looking for what happened after a specific piece of SEO work instead? See <Link href={`/dashboard/${orgSlug}/outcomes`}>Outcomes</Link>.
      </p>

      <div className="dash-grid dash-grid-cols-3" style={{ marginBottom: !isSearchConsoleConnected || !hasSearchConsoleData ? 0 : 28 }}>
        <DeltaStat label="Clicks" value={current.clicks.toLocaleString()} delta={clicksDelta} deltaSuffix="vs previous period" />
        <DeltaStat label="Impressions" value={current.impressions.toLocaleString()} delta={impressionsDelta} deltaSuffix="vs previous period" />
        <DeltaStat label="Average position" value={current.position !== null ? String(current.position) : "-"} secondary={`previously ${previous.position ?? "-"}`} />
      </div>
      {!isSearchConsoleConnected && (
        <div className="dash-notice" style={{ marginTop: 16, marginBottom: 28 }}>
          No Google Search Console data yet
          {canConnectSearchConsole ? (
            <>
              {" "}
              — connect it from <Link href={`/dashboard/${orgSlug}/settings`}>Settings</Link> to see real performance here.
            </>
          ) : (
            " — ask an Owner on your team to connect Google Search Console from Settings."
          )}
        </div>
      )}
      {isSearchConsoleConnected && !hasSearchConsoleData && (
        <div className="dash-notice" style={{ marginTop: 16, marginBottom: 28 }}>
          Search Console is connected — data is on its way. Google Search Console data usually takes a couple of days to start appearing after connecting; nothing further is needed on your side.
        </div>
      )}

      {isSearchConsoleConnected && (
        <>
          <h2 style={{ fontSize: "1rem" }}>Clicks &amp; impressions trend</h2>
          <p className="dash-muted" style={{ fontSize: "0.8rem", marginTop: -8, marginBottom: 16 }}>
            Real Google Search Console data, day by day
            {latestSyncedDate ? (
              <>
                {" "}
                — through <strong>{new Date(`${latestSyncedDate}T00:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</strong>
              </>
            ) : (
              " — nothing synced for this window yet"
            )}
            .
          </p>
          <div className="dash-grid dash-grid-cols-2" style={{ marginBottom: 28, gap: 20 }}>
            <div className="dash-card">
              <div className="dash-stat-label">Clicks</div>
              <TrendChart points={dailySeries.map((p) => ({ date: p.date, value: p.clicks }))} color="var(--dash-primary)" label="Clicks" />
              <p className="dash-muted" style={{ fontSize: "0.8rem", marginTop: 8, marginBottom: 0 }}>{trendSentence("Clicks", clicksDelta)}</p>
            </div>
            <div className="dash-card">
              <div className="dash-stat-label">Impressions</div>
              <TrendChart points={dailySeries.map((p) => ({ date: p.date, value: p.impressions }))} color="var(--dash-info)" label="Impressions" />
              <p className="dash-muted" style={{ fontSize: "0.8rem", marginTop: 8, marginBottom: 0 }}>{trendSentence("Impressions", impressionsDelta)}</p>
            </div>
          </div>
        </>
      )}

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
      <p className="dash-muted" style={{ fontSize: "0.82rem", marginTop: -20, marginBottom: 28 }}>
        Per-action detail — including which pages, what changed, and why — is on <Link href={`/dashboard/${orgSlug}/outcomes`}>Outcomes</Link>.
      </p>

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
