import Link from "next/link";
import { notFound } from "next/navigation";
import { getWebsite } from "@/lib/db/websites";
import { listCompetitorDomainsForWebsite } from "@/lib/db/competitors";
import { listRecentSerpRunsForWebsite, listSerpResultsForRuns } from "@/lib/db/serp";
import { getProviderUsageSummaryForWebsite } from "@/lib/db/provider-usage";
import { listJobsForWebsite } from "@/lib/db/jobs";
import { triggerSerpFetchAction, updateSerpLocationAction } from "@/app/admin/actions";

export const dynamic = "force-dynamic";

function fmt(date: string | null): string {
  return date ? new Date(date).toLocaleString() : "-";
}

export default async function WebsiteCompetitorsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const website = await getWebsite(id);
  if (!website) notFound();

  const [competitors, recentRuns, jobs, usage] = await Promise.all([
    listCompetitorDomainsForWebsite(website.id),
    listRecentSerpRunsForWebsite(website.id, 20),
    listJobsForWebsite(website.id, 8),
    getProviderUsageSummaryForWebsite(website.id, 30),
  ]);

  const runIds = recentRuns.filter((r) => r.status === "COMPLETED").map((r) => r.id);
  const results = await listSerpResultsForRuns(runIds);
  const resultsByRun = new Map<string, typeof results>();
  for (const r of results) {
    const list = resultsByRun.get(r.serp_run_id) ?? [];
    list.push(r);
    resultsByRun.set(r.serp_run_id, list);
  }

  const pipelineJobs = jobs.filter((j) => j.job_type === "FETCH_SERP_RESULTS" || j.job_type === "ANALYSE_COMPETITORS" || j.job_type === "ANALYSE_COMPETITOR_GAPS");

  return (
    <>
      <p className="row">
        <Link href={`/admin/websites/${website.id}`}>&larr; {website.name}</Link>
        <Link href={`/admin/websites/${website.id}/search-performance?detector=COMPETITOR_CONTENT_GAP`}>Competitive opportunities &rarr;</Link>
      </p>
      <h1>Competitor &amp; SERP Intelligence — {website.name}</h1>

      <div className="notice">
        Real Google SERP data (via DataForSEO where configured) — positions/domains/features are measured, not estimated.
        Competitor classification and the relevance score are deterministic (see README); they are <strong>not</strong> Google&apos;s
        authority/domain-rating. Content-gap and ranking-gap opportunities appear on the{" "}
        <Link href={`/admin/websites/${website.id}/search-performance`}>SEO Decision Engine page</Link>, filterable by detector type.
      </div>

      <div className="card row">
        <form action={triggerSerpFetchAction}>
          <input type="hidden" name="website_id" value={website.id} />
          <input type="hidden" name="organization_id" value={website.organization_id} />
          <button className="btn" type="submit">
            Fetch SERP results
          </button>
        </form>
        <span className="muted">Also chains automatically into competitor analysis and gap detection once it completes.</span>
      </div>

      <div className="card">
        <form action={updateSerpLocationAction} className="row">
          <input type="hidden" name="website_id" value={website.id} />
          <label>
            Default SERP location{" "}
            <input type="text" name="default_serp_location" defaultValue={website.default_serp_location ?? ""} placeholder="e.g. Coventry,England,United Kingdom" style={{ width: "20rem" }} />
          </label>
          <button className="btn secondary" type="submit">
            Save
          </button>
        </form>
        <p className="muted">Local SEO matters — the same keyword can rank differently in different locations. Leave blank to fall back to a country-level default.</p>
      </div>

      <h2>Recent pipeline jobs</h2>
      <table>
        <thead>
          <tr>
            <th>Type</th>
            <th>Status</th>
            <th>Created</th>
            <th>Completed</th>
            <th>Error</th>
          </tr>
        </thead>
        <tbody>
          {pipelineJobs.map((job) => (
            <tr key={job.id}>
              <td className="muted">{job.job_type}</td>
              <td>
                <span className={`badge ${job.status}`}>{job.status}</span>
              </td>
              <td className="muted">{fmt(job.created_at)}</td>
              <td className="muted">{fmt(job.completed_at)}</td>
              <td className="muted">{job.error ?? ""}</td>
            </tr>
          ))}
          {pipelineJobs.length === 0 && (
            <tr>
              <td colSpan={5} className="muted">
                No SERP/competitor jobs run yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <h2>Competitors ({competitors.length})</h2>
      <table>
        <thead>
          <tr>
            <th>Domain</th>
            <th>Classification</th>
            <th>Relevant keywords</th>
            <th>Avg. position</th>
            <th>Appearances</th>
            <th>Relevance score</th>
            <th>First seen</th>
            <th>Last seen</th>
          </tr>
        </thead>
        <tbody>
          {competitors.map((c) => (
            <tr key={c.id}>
              <td>{c.domain}</td>
              <td>
                <span className={`badge ${c.classification}`}>{c.classification}</span>
              </td>
              <td>{c.relevant_keyword_count}</td>
              <td className="muted">{c.average_position ?? "-"}</td>
              <td className="muted">{c.appearances}</td>
              <td>{c.relevance_score ?? "-"}</td>
              <td className="muted">{fmt(c.first_seen_at)}</td>
              <td className="muted">{fmt(c.last_seen_at)}</td>
            </tr>
          ))}
          {competitors.length === 0 && (
            <tr>
              <td colSpan={8} className="muted">
                No competitors identified yet — fetch SERP results first.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <h2>Recent SERPs ({recentRuns.length})</h2>
      <table>
        <thead>
          <tr>
            <th>Keyword</th>
            <th>Location</th>
            <th>Status</th>
            <th>Client position</th>
            <th>Top competitor</th>
            <th>Features</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          {recentRuns.map((run) => {
            const runResults = resultsByRun.get(run.id) ?? [];
            const clientResult = runResults.find((r) => r.is_client_domain);
            const topCompetitor = runResults.filter((r) => !r.is_client_domain).sort((a, b) => a.position - b.position)[0];
            const features = run.features as Record<string, unknown>;
            const activeFeatures = Object.entries(features)
              .filter(([k, v]) => k !== "other" && v === true)
              .map(([k]) => k);
            return (
              <tr key={run.id}>
                <td>{run.keyword}</td>
                <td className="muted">{run.location ?? "-"}</td>
                <td>
                  <span className={`badge ${run.status}`}>{run.status}</span>
                </td>
                <td className="muted">{clientResult?.position ?? "not ranked"}</td>
                <td className="muted">{topCompetitor ? `${topCompetitor.domain} (#${topCompetitor.position})` : "-"}</td>
                <td className="muted">{activeFeatures.length > 0 ? activeFeatures.join(", ") : "-"}</td>
                <td className="muted">{fmt(run.searched_at ?? run.created_at)}</td>
              </tr>
            );
          })}
          {recentRuns.length === 0 && (
            <tr>
              <td colSpan={7} className="muted">
                No SERP data fetched yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <h2>Provider usage (last 30 days)</h2>
      <table>
        <thead>
          <tr>
            <th>Total units</th>
            <th>Estimated cost (USD)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{usage.totalUnits}</td>
            <td className="muted">${usage.totalEstimatedCostUsd.toFixed(4)} (estimate only — see README)</td>
          </tr>
        </tbody>
      </table>
    </>
  );
}
