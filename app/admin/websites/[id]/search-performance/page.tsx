import Link from "next/link";
import { notFound } from "next/navigation";
import { getWebsite } from "@/lib/db/websites";
import { getSearchPerformanceStatsForWebsite, listSearchPerformanceOpportunitiesForWebsite } from "@/lib/db/search-performance";
import { listJobsForWebsite, getLatestJobForWebsite } from "@/lib/db/jobs";
import { triggerSearchPerformanceAnalysisAction, updateSearchPerformanceOpportunityStatusAction } from "@/app/admin/actions";
import { PROMOTION_THRESHOLD } from "@/lib/search-performance/limits";
import type { SearchPerformanceDetectorType, OpportunityType, OpportunityStatus } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

const DETECTOR_TYPES: SearchPerformanceDetectorType[] = [
  "PAGE_TWO_OPPORTUNITY",
  "HIGH_IMPRESSIONS_LOW_CTR",
  "MISSING_PAGE",
  "DECLINING_KEYWORD",
  "EMERGING_KEYWORD",
  "CONTENT_GAP",
  "INTERNAL_LINK_OPPORTUNITY",
];
const RECOMMENDED_ACTIONS: OpportunityType[] = [
  "CREATE_NEW_PAGE",
  "OPTIMISE_EXISTING_PAGE",
  "IMPROVE_CTR",
  "INVESTIGATE_DECLINE",
  "INVESTIGATE_OPPORTUNITY",
  "IMPROVE_INTERNAL_LINKING",
];
const STATUSES: OpportunityStatus[] = ["new", "approved", "rejected", "done"];

function fmt(date: string | null): string {
  return date ? new Date(date).toLocaleString() : "-";
}

function detectorLabel(type: string): string {
  return type.replace(/_/g, " ");
}

function signal(signals: unknown, key: string): string {
  if (!signals || typeof signals !== "object") return "-";
  const value = (signals as Record<string, unknown>)[key];
  if (value === null || value === undefined) return "-";
  if (typeof value === "number") return String(Math.round(value * 100) / 100);
  return String(value);
}

export default async function WebsiteSearchPerformancePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ detector?: string; action?: string; status?: string; minScore?: string }>;
}) {
  const { id } = await params;
  const filters = await searchParams;
  const website = await getWebsite(id);
  if (!website) notFound();

  const dbFilters = {
    detectorType: (filters.detector as SearchPerformanceDetectorType) || undefined,
    recommendedAction: (filters.action as OpportunityType) || undefined,
    status: (filters.status as OpportunityStatus) || undefined,
    minScore: filters.minScore ? Number(filters.minScore) : undefined,
  };

  const [stats, opportunities, jobs, latestRun] = await Promise.all([
    getSearchPerformanceStatsForWebsite(website.id, PROMOTION_THRESHOLD),
    listSearchPerformanceOpportunitiesForWebsite(website.id, dbFilters),
    listJobsForWebsite(website.id, 5),
    getLatestJobForWebsite(website.id, "ANALYSE_SEARCH_PERFORMANCE", "COMPLETED"),
  ]);

  const analysisJobs = jobs.filter((j) => j.job_type === "ANALYSE_SEARCH_PERFORMANCE");

  return (
    <>
      <p>
        <Link href={`/admin/websites/${website.id}`}>&larr; {website.name}</Link>
      </p>
      <h1>SEO Decision Engine — {website.name}</h1>

      <div className="notice">
        Deterministic signals only — position/impressions/clicks/CTR are actual Google Search Console data (see the{" "}
        <Link href={`/admin/websites/${website.id}/search-console`}>Search Console page</Link>), scores are computed in TypeScript
        (see README), and &quot;AI rationale&quot; is an optional, separately-stored interpretation layer — never the source of a
        number shown here.
      </div>

      <div className="card row">
        <form action={triggerSearchPerformanceAnalysisAction}>
          <input type="hidden" name="website_id" value={website.id} />
          <input type="hidden" name="organization_id" value={website.organization_id} />
          <button className="btn" type="submit">
            Run analysis
          </button>
        </form>
        <span className="muted">
          Also runs automatically after a Search Console sync completes &middot; last completed: {fmt(latestRun?.completed_at ?? null)}
        </span>
      </div>

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

      <h2>Overview</h2>
      <table>
        <thead>
          <tr>
            <th>Total opportunities</th>
            <th>High-scoring (&ge;{PROMOTION_THRESHOLD})</th>
            <th>Promoted to tasks</th>
            {DETECTOR_TYPES.map((d) => (
              <th key={d}>{detectorLabel(d)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{stats.totalOpportunities}</td>
            <td>{stats.highScoreCount}</td>
            <td>{stats.promotedCount}</td>
            {DETECTOR_TYPES.map((d) => (
              <td key={d} className="muted">
                {stats.byDetector[d] ?? 0}
              </td>
            ))}
          </tr>
        </tbody>
      </table>

      <h2>Opportunities ({opportunities.length})</h2>
      <form className="card row" method="get">
        <label>
          Type{" "}
          <select name="detector" defaultValue={filters.detector ?? ""}>
            <option value="">any</option>
            {DETECTOR_TYPES.map((d) => (
              <option key={d} value={d}>
                {detectorLabel(d)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Action{" "}
          <select name="action" defaultValue={filters.action ?? ""}>
            <option value="">any</option>
            {RECOMMENDED_ACTIONS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status{" "}
          <select name="status" defaultValue={filters.status ?? ""}>
            <option value="">any</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label>
          Min score <input type="number" name="minScore" step="0.1" defaultValue={filters.minScore ?? ""} style={{ width: "5rem" }} />
        </label>
        <button className="btn secondary" type="submit">
          Filter
        </button>
      </form>

      <table>
        <thead>
          <tr>
            <th>Type</th>
            <th>Score</th>
            <th>Action</th>
            <th>Position</th>
            <th>Impressions</th>
            <th>Clicks</th>
            <th>CTR</th>
            <th>vs previous period</th>
            <th>AI rationale</th>
            <th>Status</th>
            <th>Promoted</th>
          </tr>
        </thead>
        <tbody>
          {opportunities.map((o) => (
            <tr key={o.id}>
              <td className="muted">{detectorLabel(o.detector_type)}</td>
              <td>{o.opportunity_score}</td>
              <td>{o.recommended_action}</td>
              <td className="muted">{signal(o.signals, "position") !== "-" ? signal(o.signals, "position") : signal(o.signals, "currentPosition")}</td>
              <td className="muted">{signal(o.signals, "impressions") !== "-" ? signal(o.signals, "impressions") : signal(o.signals, "currentImpressions")}</td>
              <td className="muted">{signal(o.signals, "clicks") !== "-" ? signal(o.signals, "clicks") : signal(o.signals, "currentClicks")}</td>
              <td className="muted">{signal(o.signals, "actualCtr") !== "-" ? signal(o.signals, "actualCtr") : signal(o.signals, "ctr")}</td>
              <td className="muted">
                {signal(o.signals, "clicksDeltaPct") !== "-" && `clicks ${signal(o.signals, "clicksDeltaPct")}% `}
                {signal(o.signals, "impressionsDeltaPct") !== "-" && `impr ${signal(o.signals, "impressionsDeltaPct")}%`}
              </td>
              <td className="muted">{o.ai_rationale ?? <span className="muted">not yet interpreted</span>}</td>
              <td>
                <form action={updateSearchPerformanceOpportunityStatusAction} className="row">
                  <input type="hidden" name="opportunity_id" value={o.id} />
                  <input type="hidden" name="website_id" value={website.id} />
                  <select name="status" defaultValue={o.status}>
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <button className="btn secondary" type="submit">
                    Update
                  </button>
                </form>
              </td>
              <td className="muted">{o.seo_opportunity_id ? "yes -> SEO task" : "no"}</td>
            </tr>
          ))}
          {opportunities.length === 0 && (
            <tr>
              <td colSpan={11} className="muted">
                No opportunities yet — run analysis to generate some (requires at least a crawl; Search Console data and keyword
                discovery improve coverage but aren&apos;t required for every detector).
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </>
  );
}
