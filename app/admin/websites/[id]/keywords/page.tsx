import Link from "next/link";
import { notFound } from "next/navigation";
import { getWebsite } from "@/lib/db/websites";
import { getKeywordStatsForWebsite, listKeywordOpportunitiesForWebsite } from "@/lib/db/keywords";
import { getLatestJobForWebsite, listJobsForWebsite } from "@/lib/db/jobs";
import { triggerKeywordDiscoveryAction } from "@/app/admin/actions";
import { PROMOTION_THRESHOLD } from "@/lib/keywords/limits";
import type { KeywordSearchIntent, KeywordSource, OpportunityType, OpportunityStatus } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

const INTENTS: KeywordSearchIntent[] = ["INFORMATIONAL", "COMMERCIAL", "TRANSACTIONAL", "NAVIGATIONAL", "LOCAL", "UNKNOWN"];
const ACTIONS: OpportunityType[] = ["CREATE_NEW_PAGE", "OPTIMISE_EXISTING_PAGE", "TECHNICAL_FIX", "INTERNAL_LINKING", "RESEARCH_REQUIRED"];
const SOURCES: KeywordSource[] = ["ai_suggested", "provider", "manual"];
const STATUSES: OpportunityStatus[] = ["new", "approved", "rejected", "done"];

function fmt(date: string | null): string {
  return date ? new Date(date).toLocaleString() : "-";
}

function sourceLabel(source: KeywordSource): string {
  if (source === "provider") return "Provider data";
  if (source === "ai_suggested") return "AI recommendation";
  return "Manual entry";
}

export default async function WebsiteKeywordsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ intent?: string; action?: string; status?: string; source?: string }>;
}) {
  const { id } = await params;
  const filters = await searchParams;
  const website = await getWebsite(id);
  if (!website) notFound();

  const dbFilters = {
    intent: (filters.intent as KeywordSearchIntent) || undefined,
    action: (filters.action as OpportunityType) || undefined,
    status: (filters.status as OpportunityStatus) || undefined,
    source: (filters.source as KeywordSource) || undefined,
  };

  const [stats, opportunities, jobs, latestDiscovery] = await Promise.all([
    getKeywordStatsForWebsite(website.id, PROMOTION_THRESHOLD),
    listKeywordOpportunitiesForWebsite(website.id, dbFilters),
    listJobsForWebsite(website.id, 5),
    getLatestJobForWebsite(website.id, "KEYWORD_DISCOVERY", "COMPLETED"),
  ]);

  const discoveryJobs = jobs.filter((j) => j.job_type === "KEYWORD_DISCOVERY");

  return (
    <>
      <p>
        <Link href={`/admin/websites/${website.id}`}>&larr; {website.name}</Link>
      </p>
      <h1>Keyword Intelligence — {website.name}</h1>

      <div className="notice">
        Scores here are an internal prioritisation formula (see README), not a Google ranking prediction, and not
        measured search-volume/CPC/competition data unless explicitly labeled "Provider data". Matching is lexical +
        AI-assisted, not true semantic/embeddings search.
      </div>

      <div className="card row">
        <form action={triggerKeywordDiscoveryAction}>
          <input type="hidden" name="website_id" value={website.id} />
          <input type="hidden" name="organization_id" value={website.organization_id} />
          <button className="btn" type="submit">
            Run Keyword Discovery
          </button>
        </form>
        <span className="muted">
          Runs every {website.keyword_discovery_frequency_days}d automatically &middot; last completed: {fmt(latestDiscovery?.completed_at ?? null)}
        </span>
      </div>

      <h2>Recent discovery jobs</h2>
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
          {discoveryJobs.map((job) => (
            <tr key={job.id}>
              <td>
                <span className={`badge ${job.status}`}>{job.status}</span>
              </td>
              <td className="muted">{fmt(job.created_at)}</td>
              <td className="muted">{fmt(job.completed_at)}</td>
              <td className="muted">{job.error ?? ""}</td>
            </tr>
          ))}
          {discoveryJobs.length === 0 && (
            <tr>
              <td colSpan={4} className="muted">
                No keyword discovery jobs run yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <h2>Overview</h2>
      <table>
        <thead>
          <tr>
            <th>Total keywords</th>
            <th>With metrics</th>
            <th>With page match</th>
            <th>Keyword gaps</th>
            <th>High-opportunity</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{stats.totalKeywords}</td>
            <td>{stats.keywordsWithMetrics}</td>
            <td>{stats.keywordsWithPageMatches}</td>
            <td>{stats.keywordGaps}</td>
            <td>{stats.highOpportunityCount}</td>
          </tr>
        </tbody>
      </table>

      <h2>Opportunities ({opportunities.length})</h2>
      <form className="card row" method="get">
        <label>
          Intent{" "}
          <select name="intent" defaultValue={filters.intent ?? ""}>
            <option value="">any</option>
            {INTENTS.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
        </label>
        <label>
          Action{" "}
          <select name="action" defaultValue={filters.action ?? ""}>
            <option value="">any</option>
            {ACTIONS.map((a) => (
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
          Source{" "}
          <select name="source" defaultValue={filters.source ?? ""}>
            <option value="">any</option>
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                {sourceLabel(s)}
              </option>
            ))}
          </select>
        </label>
        <button className="btn secondary" type="submit">
          Filter
        </button>
      </form>

      <table>
        <thead>
          <tr>
            <th>Keyword</th>
            <th>Intent</th>
            <th>Source</th>
            <th>Action</th>
            <th>Score</th>
            <th>Current page</th>
            <th>Status</th>
            <th>Promoted</th>
          </tr>
        </thead>
        <tbody>
          {opportunities.map((o) => (
            <tr key={o.id}>
              <td>{o.keyword}</td>
              <td className="muted">{o.keyword_search_intent}</td>
              <td className="muted">{sourceLabel(o.keyword_source)}</td>
              <td>{o.opportunity_type}</td>
              <td>{o.opportunity_score}</td>
              <td className="muted">{o.current_page_id ? "existing page" : "none (gap)"}</td>
              <td>
                <span className={`badge ${o.status}`}>{o.status}</span>
              </td>
              <td className="muted">{o.seo_opportunity_id ? "yes -> SEO task" : "no"}</td>
            </tr>
          ))}
          {opportunities.length === 0 && (
            <tr>
              <td colSpan={8} className="muted">
                No keyword opportunities yet — run keyword discovery to generate some.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </>
  );
}
