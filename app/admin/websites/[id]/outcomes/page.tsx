import Link from "next/link";
import { notFound } from "next/navigation";
import { getWebsite } from "@/lib/db/websites";
import { getSearchConsoleStatsForWebsite } from "@/lib/db/search-console";
import { listSeoActionsForWebsite, getSeoActionStatsForWebsite } from "@/lib/db/seo-actions";
import { listLatestOutcomesByActionForWebsite, getSeoActionOutcomeStatsForWebsite } from "@/lib/db/seo-action-outcomes";
import { listAlertsForWebsite } from "@/lib/db/seo-alerts";
import { getLatestJobForWebsite, listJobsForWebsite } from "@/lib/db/jobs";
import { triggerActionOutcomesAnalysisAction, updateAutonomyLevelAction, acknowledgeAlertAction } from "@/app/admin/actions";
import type { AutonomyLevel } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

const AUTONOMY_LEVELS: AutonomyLevel[] = ["MANUAL", "AI_RECOMMENDS", "AI_PREPARES", "AI_EXECUTES"];

function fmt(date: string | null): string {
  return date ? new Date(date).toLocaleString() : "-";
}

function num(value: unknown): string {
  if (value === null || value === undefined) return "-";
  if (typeof value !== "number") return String(value);
  return String(Math.round(value * 100) / 100);
}

interface WindowMetricsLike {
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number | null;
}

function metricsSummary(value: unknown): string {
  const m = (value ?? {}) as WindowMetricsLike;
  const clicks = m.clicks ?? 0;
  const impressions = m.impressions ?? 0;
  const position = m.position;
  return `${clicks}c / ${impressions}i${position !== null && position !== undefined ? ` / pos ${num(position)}` : ""}`;
}

interface DeltasLike {
  clicksChangePct?: number | null;
  impressionsChangePct?: number | null;
  positionChange?: number | null;
}

function deltaSummary(value: unknown): string {
  const d = (value ?? {}) as DeltasLike;
  const parts: string[] = [];
  if (d.clicksChangePct !== null && d.clicksChangePct !== undefined) parts.push(`clicks ${d.clicksChangePct >= 0 ? "+" : ""}${d.clicksChangePct}%`);
  if (d.positionChange !== null && d.positionChange !== undefined) parts.push(`pos ${d.positionChange >= 0 ? "improved" : "declined"} ${Math.abs(d.positionChange)}`);
  return parts.join(", ") || "-";
}

function actionLabel(type: string): string {
  return type.replace(/_/g, " ");
}

export default async function WebsiteOutcomesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const website = await getWebsite(id);
  if (!website) notFound();

  const [gscStats, actionStats, outcomeStats, actions, latestOutcomesByAction, alerts, jobs, latestRun] = await Promise.all([
    getSearchConsoleStatsForWebsite(website.id),
    getSeoActionStatsForWebsite(website.id),
    getSeoActionOutcomeStatsForWebsite(website.id),
    listSeoActionsForWebsite(website.id, { status: "EXECUTED" }),
    listLatestOutcomesByActionForWebsite(website.id),
    listAlertsForWebsite(website.id, { status: "open" }),
    listJobsForWebsite(website.id, 5),
    getLatestJobForWebsite(website.id, "ANALYSE_ACTION_OUTCOMES", "COMPLETED"),
  ]);

  const analysisJobs = jobs.filter((j) => j.job_type === "ANALYSE_ACTION_OUTCOMES");

  let pagesImproving = 0;
  let pagesDeclining = 0;
  const newPageActions = actions.filter((a) => a.action_type === "CREATE_NEW_PAGE");
  for (const action of actions) {
    const outcome = latestOutcomesByAction.get(action.id);
    if (!outcome) continue;
    if (outcome.classification === "POSITIVE") pagesImproving++;
    if (outcome.classification === "NEGATIVE") pagesDeclining++;
  }

  return (
    <>
      <p>
        <Link href={`/admin/websites/${website.id}`}>&larr; {website.name}</Link>
      </p>
      <h1>SEO Performance &amp; Outcomes — {website.name}</h1>

      <div className="notice">
        This page describes <strong>observed change following an action</strong>, never a claim that the action caused it — SEO
        performance is affected by many factors outside this platform&apos;s visibility (algorithm updates, seasonality, competitor
        activity). Classifications below (POSITIVE/NEGATIVE/MIXED/INCONCLUSIVE/INSUFFICIENT_DATA) are computed deterministically in
        TypeScript from real Search Console data; &quot;AI interpretation&quot; is a separate, optional, additive layer that can
        never override a deterministic classification.
      </div>

      <div className="card row">
        <form action={triggerActionOutcomesAnalysisAction}>
          <input type="hidden" name="website_id" value={website.id} />
          <input type="hidden" name="organization_id" value={website.organization_id} />
          <button className="btn" type="submit">
            Run outcome analysis
          </button>
        </form>
        <form action={updateAutonomyLevelAction} className="row">
          <input type="hidden" name="website_id" value={website.id} />
          <label>
            Autonomy level{" "}
            <select name="autonomy_level" defaultValue={website.autonomy_level}>
              {AUTONOMY_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </label>
          <button className="btn secondary" type="submit">
            Save
          </button>
        </form>
        <span className="muted">last completed: {fmt(latestRun?.completed_at ?? null)}</span>
      </div>
      <div className="notice">
        Autonomy level ({website.autonomy_level}) only ever controls whether this platform is allowed to create passive
        follow-up <em>recommendations</em> (MANUAL disables even that). No autonomy level in Phase 6 permits publishing or
        modifying content automatically — every content change still requires an explicit human approval and Publish click
        (see the Content/Publishing pages).
      </div>

      <h2>Overview</h2>
      <table>
        <thead>
          <tr>
            <th>Organic clicks (all-time)</th>
            <th>Impressions</th>
            <th>Avg position</th>
            <th>Actions executed</th>
            <th>Positive outcomes</th>
            <th>Needing attention</th>
            <th>Pages improving</th>
            <th>Pages declining</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{gscStats.totalClicks}</td>
            <td>{gscStats.totalImpressions}</td>
            <td>{num(gscStats.averagePosition)}</td>
            <td>{actionStats.byStatus.EXECUTED ?? 0}</td>
            <td className="muted">{outcomeStats.byClassification.POSITIVE ?? 0}</td>
            <td className="muted">{outcomeStats.actionsNeedingAttention}</td>
            <td className="muted">{pagesImproving}</td>
            <td className="muted">{pagesDeclining}</td>
          </tr>
        </tbody>
      </table>

      <h2>Alerts ({alerts.length} open)</h2>
      <table>
        <thead>
          <tr>
            <th>Severity</th>
            <th>Type</th>
            <th>Message</th>
            <th>Created</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {alerts.map((alert) => (
            <tr key={alert.id}>
              <td>
                <span className={`badge ${alert.severity}`}>{alert.severity}</span>
              </td>
              <td className="muted">{actionLabel(alert.alert_type)}</td>
              <td>{alert.message}</td>
              <td className="muted">{fmt(alert.created_at)}</td>
              <td>
                <form action={acknowledgeAlertAction}>
                  <input type="hidden" name="alert_id" value={alert.id} />
                  <input type="hidden" name="website_id" value={website.id} />
                  <button className="btn secondary" type="submit">
                    Acknowledge
                  </button>
                </form>
              </td>
            </tr>
          ))}
          {alerts.length === 0 && (
            <tr>
              <td colSpan={5} className="muted">
                No open alerts.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <h2>Action outcomes ({actions.length})</h2>
      <table>
        <thead>
          <tr>
            <th>Action</th>
            <th>Target</th>
            <th>Keyword</th>
            <th>Executed</th>
            <th>Baseline</th>
            <th>Current</th>
            <th>Change</th>
            <th>Window</th>
            <th>Outcome</th>
            <th>Data sufficient</th>
            <th>Recommendation</th>
            <th>AI interpretation</th>
          </tr>
        </thead>
        <tbody>
          {actions.map((action) => {
            const outcome = latestOutcomesByAction.get(action.id);
            return (
              <tr key={action.id}>
                <td className="muted">{actionLabel(action.action_type)}</td>
                <td className="muted">{action.target_url ?? "-"}</td>
                <td className="muted">{action.target_keyword_text ?? "-"}</td>
                <td className="muted">{fmt(action.executed_at)}</td>
                <td className="muted">{outcome ? metricsSummary(outcome.baseline_metrics) : action.baseline_captured_at ? metricsSummary(action.baseline_metrics) : "not yet captured"}</td>
                <td className="muted">{outcome ? metricsSummary(outcome.current_metrics) : "-"}</td>
                <td className="muted">{outcome ? deltaSummary(outcome.deltas) : "-"}</td>
                <td className="muted">{outcome ? `${outcome.measurement_window_days}d` : "-"}</td>
                <td>{outcome ? <span className={`badge ${outcome.classification}`}>{outcome.classification}</span> : <span className="muted">no window due yet</span>}</td>
                <td className="muted">{outcome ? (outcome.data_sufficient ? "yes" : "no") : "-"}</td>
                <td className="muted">{outcome?.recommendation ?? "-"}</td>
                <td className="muted">{outcome?.ai_interpretation ?? <span className="muted">not yet interpreted</span>}</td>
              </tr>
            );
          })}
          {actions.length === 0 && (
            <tr>
              <td colSpan={12} className="muted">
                No executed SEO actions yet — actions are recorded automatically when content is published or a task is marked
                completed.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <h2>New pages — lifecycle ({newPageActions.length})</h2>
      <div className="notice">
        &quot;VISIBLE&quot; means Search Console has recorded impressions for this URL — evidence of visibility, not a claim
        about Google&apos;s indexing status or mechanics.
      </div>
      <table>
        <thead>
          <tr>
            <th>Page</th>
            <th>Published</th>
            <th>Stage</th>
            <th>Impressions (latest window)</th>
          </tr>
        </thead>
        <tbody>
          {newPageActions.map((action) => {
            const outcome = latestOutcomesByAction.get(action.id);
            const stage = outcome?.page_lifecycle_stage ?? "NEW";
            const impressions = (outcome?.current_metrics as WindowMetricsLike | undefined)?.impressions;
            return (
              <tr key={action.id}>
                <td className="muted">{action.target_url ?? "-"}</td>
                <td className="muted">{fmt(action.executed_at)}</td>
                <td>
                  <span className={`badge ${stage}`}>{stage}</span>
                </td>
                <td className="muted">{impressions ?? "-"}</td>
              </tr>
            );
          })}
          {newPageActions.length === 0 && (
            <tr>
              <td colSpan={4} className="muted">
                No new pages published yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <h2>Recent analysis jobs</h2>
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
          {analysisJobs.map((job) => (
            <tr key={job.id}>
              <td>
                <span className={`badge ${job.status}`}>{job.status}</span>
              </td>
              <td className="muted">{fmt(job.created_at)}</td>
              <td className="muted">{fmt(job.completed_at)}</td>
              <td className="muted">{job.error ?? ""}</td>
            </tr>
          ))}
          {analysisJobs.length === 0 && (
            <tr>
              <td colSpan={4} className="muted">
                No analysis runs yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </>
  );
}
