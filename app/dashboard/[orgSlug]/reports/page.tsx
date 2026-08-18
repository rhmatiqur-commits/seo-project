import { requireOrganizationMembership } from "@/lib/auth/session";
import { getPrimaryWebsiteForOrganization } from "@/lib/dashboard/website";
import { listSearchConsoleMetricsForWebsiteInRange } from "@/lib/db/search-console";
import { listIssuesForWebsite } from "@/lib/db/audits";
import { listOpportunitiesForWebsite } from "@/lib/db/opportunities";
import { listSeoActionsForWebsite } from "@/lib/db/seo-actions";
import { listLatestOutcomesByActionForWebsite } from "@/lib/db/seo-action-outcomes";

export const dynamic = "force-dynamic";

const WINDOW_DAYS = 28;
const DAY_MS = 24 * 60 * 60 * 1000;

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function summarize(rows: { clicks: number; impressions: number; position: number | null }[]) {
  let clicks = 0;
  let impressions = 0;
  let posSum = 0;
  let posWeight = 0;
  for (const r of rows) {
    clicks += r.clicks;
    impressions += r.impressions;
    if (r.position !== null) {
      posSum += r.position * r.impressions;
      posWeight += r.impressions;
    }
  }
  return { clicks, impressions, position: posWeight > 0 ? Math.round((posSum / posWeight) * 10) / 10 : null };
}

function deltaLabel(current: number, previous: number): { text: string; tone: string } {
  if (previous === 0) return { text: current > 0 ? "New" : "-", tone: "flat" };
  const pct = Math.round(((current - previous) / previous) * 1000) / 10;
  if (pct > 0) return { text: `+${pct}%`, tone: "up" };
  if (pct < 0) return { text: `${pct}%`, tone: "down" };
  return { text: "No change", tone: "flat" };
}

export default async function ReportsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { organization } = await requireOrganizationMembership(orgSlug);
  const website = await getPrimaryWebsiteForOrganization(organization.id);

  if (!website) {
    return (
      <>
        <h1 className="dash-page-title">Reports</h1>
        <p className="dash-empty">No website configured yet.</p>
      </>
    );
  }

  const now = new Date();
  const currentStart = new Date(now.getTime() - WINDOW_DAYS * DAY_MS);
  const previousEnd = new Date(currentStart.getTime() - DAY_MS);
  const previousStart = new Date(previousEnd.getTime() - WINDOW_DAYS * DAY_MS);

  const [currentRows, previousRows, issues, opportunities, actions] = await Promise.all([
    listSearchConsoleMetricsForWebsiteInRange(website.id, toIsoDate(currentStart), toIsoDate(now)),
    listSearchConsoleMetricsForWebsiteInRange(website.id, toIsoDate(previousStart), toIsoDate(previousEnd)),
    listIssuesForWebsite(website.id),
    listOpportunitiesForWebsite(website.id),
    listSeoActionsForWebsite(website.id, { status: "EXECUTED" }),
  ]);
  const latestOutcomes = await listLatestOutcomesByActionForWebsite(website.id);

  const current = summarize(currentRows);
  const previous = summarize(previousRows);
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

  const clicksDelta = deltaLabel(current.clicks, previous.clicks);
  const impressionsDelta = deltaLabel(current.impressions, previous.impressions);

  return (
    <>
      <h1 className="dash-page-title">Performance report</h1>
      <p className="dash-page-subtitle">
        Last {WINDOW_DAYS} days vs. the {WINDOW_DAYS} days before that.
      </p>

      <div className="dash-grid dash-grid-cols-3" style={{ marginBottom: 28 }}>
        <div className="dash-card">
          <div className="dash-stat-label">Clicks</div>
          <div className="dash-stat-value">{current.clicks.toLocaleString()}</div>
          <div className={`dash-stat-delta ${clicksDelta.tone}`}>{clicksDelta.text} vs previous period</div>
        </div>
        <div className="dash-card">
          <div className="dash-stat-label">Impressions</div>
          <div className="dash-stat-value">{current.impressions.toLocaleString()}</div>
          <div className={`dash-stat-delta ${impressionsDelta.tone}`}>{impressionsDelta.text} vs previous period</div>
        </div>
        <div className="dash-card">
          <div className="dash-stat-label">Average position</div>
          <div className="dash-stat-value">{current.position ?? "-"}</div>
          <div className="dash-muted" style={{ fontSize: "0.82rem" }}>previously {previous.position ?? "-"}</div>
        </div>
      </div>

      <h2 style={{ fontSize: "1rem" }}>SEO actions</h2>
      <div className="dash-grid dash-grid-cols-4" style={{ marginBottom: 28 }}>
        <div className="dash-card">
          <div className="dash-stat-label">Completed</div>
          <div className="dash-stat-value">{actions.length}</div>
        </div>
        <div className="dash-card">
          <div className="dash-stat-label">Successful</div>
          <div className="dash-stat-value" style={{ color: "var(--dash-success)" }}>{successful}</div>
        </div>
        <div className="dash-card">
          <div className="dash-stat-label">Still measuring</div>
          <div className="dash-stat-value">{stillMeasuring}</div>
        </div>
        <div className="dash-card">
          <div className="dash-stat-label">Needing attention</div>
          <div className="dash-stat-value" style={{ color: needsAttention > 0 ? "var(--dash-danger)" : undefined }}>{needsAttention}</div>
        </div>
      </div>

      <h2 style={{ fontSize: "1rem" }}>Technical health</h2>
      <div className="dash-grid dash-grid-cols-3">
        <div className="dash-card">
          <div className="dash-stat-label">Open opportunities</div>
          <div className="dash-stat-value">{openOpportunities.length}</div>
        </div>
        <div className="dash-card">
          <div className="dash-stat-label">Open issues</div>
          <div className="dash-stat-value">{openIssues.length}</div>
        </div>
        <div className="dash-card">
          <div className="dash-stat-label">Critical/high issues</div>
          <div className="dash-stat-value" style={{ color: criticalOrHigh.length > 0 ? "var(--dash-danger)" : undefined }}>{criticalOrHigh.length}</div>
        </div>
      </div>
    </>
  );
}
