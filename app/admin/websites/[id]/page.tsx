import Link from "next/link";
import { notFound } from "next/navigation";
import { getWebsite } from "@/lib/db/websites";
import { getOrganization } from "@/lib/db/organizations";
import { listPagesForWebsite } from "@/lib/db/pages";
import { listIssuesForWebsite, getLatestAudit } from "@/lib/db/audits";
import { listOpportunitiesForWebsite } from "@/lib/db/opportunities";
import { listTasksForWebsite } from "@/lib/db/tasks";
import { listJobsForWebsite } from "@/lib/db/jobs";
import {
  triggerCrawlAction,
  triggerAuditAction,
  triggerOpportunitiesAction,
  updateTaskStatusAction,
} from "@/app/admin/actions";
import type { TaskStatus } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

const SEVERITY_ORDER = ["critical", "high", "medium", "low"] as const;
const TASK_STATUSES: TaskStatus[] = ["pending", "in_progress", "completed", "cancelled"];

export default async function WebsitePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const website = await getWebsite(id);
  if (!website) notFound();
  const organization = await getOrganization(website.organization_id);

  const [pages, issues, opportunities, tasks, jobs, latestAudit] = await Promise.all([
    listPagesForWebsite(id),
    listIssuesForWebsite(id),
    listOpportunitiesForWebsite(id),
    listTasksForWebsite(id),
    listJobsForWebsite(id),
    getLatestAudit(id),
  ]);

  const issuesBySeverity = SEVERITY_ORDER.map((sev) => ({
    severity: sev,
    items: issues.filter((i) => i.severity === sev),
  }));

  const tasksByStatus = TASK_STATUSES.map((status) => ({
    status,
    items: tasks.filter((t) => t.status === status),
  }));

  return (
    <>
      <p>
        <Link href={`/admin/organizations/${website.organization_id}`}>&larr; {organization?.name ?? "Organization"}</Link>
      </p>
      <h1>{website.name}</h1>
      <p className="muted">
        {website.base_url} &middot; crawl limits: {website.crawl_max_pages} pages / depth {website.crawl_max_depth} &middot; robots.txt:{" "}
        {website.robots_txt_available === null ? "unknown" : website.robots_txt_available ? "found" : "missing"} &middot; sitemap:{" "}
        {website.sitemap_available === null ? "unknown" : website.sitemap_available ? "found" : "missing"}
      </p>

      <div className="card row">
        <form action={triggerCrawlAction}>
          <input type="hidden" name="website_id" value={website.id} />
          <input type="hidden" name="organization_id" value={website.organization_id} />
          <button className="btn" type="submit">
            Crawl website
          </button>
        </form>
        <form action={triggerAuditAction}>
          <input type="hidden" name="website_id" value={website.id} />
          <input type="hidden" name="organization_id" value={website.organization_id} />
          <button className="btn" type="submit" disabled={pages.length === 0}>
            Run SEO audit
          </button>
        </form>
        <form action={triggerOpportunitiesAction}>
          <input type="hidden" name="website_id" value={website.id} />
          <input type="hidden" name="organization_id" value={website.organization_id} />
          <button className="btn" type="submit" disabled={pages.length === 0}>
            Generate AI opportunities
          </button>
        </form>
        <span className="muted">Buttons create a job and return immediately — refresh to see progress below.</span>
      </div>

      <h2>Recent jobs</h2>
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
          {jobs.map((job) => (
            <tr key={job.id}>
              <td>{job.job_type}</td>
              <td>
                <span className={`badge ${job.status}`}>{job.status}</span>
              </td>
              <td className="muted">{new Date(job.created_at).toLocaleString()}</td>
              <td className="muted">{job.completed_at ? new Date(job.completed_at).toLocaleString() : "-"}</td>
              <td className="muted">{job.error ?? ""}</td>
            </tr>
          ))}
          {jobs.length === 0 && (
            <tr>
              <td colSpan={5} className="muted">
                No jobs triggered yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <h2>Pages ({pages.length})</h2>
      <table>
        <thead>
          <tr>
            <th>URL</th>
            <th>Status</th>
            <th>Title</th>
            <th>Words</th>
            <th>Depth</th>
            <th>Flags</th>
          </tr>
        </thead>
        <tbody>
          {pages.map((p) => (
            <tr key={p.id}>
              <td>
                <a href={p.url} target="_blank" rel="noreferrer">
                  {p.path || p.url}
                </a>
              </td>
              <td>{p.http_status ?? "-"}</td>
              <td>{p.title ?? <span className="muted">missing</span>}</td>
              <td>{p.word_count ?? "-"}</td>
              <td>{p.depth ?? "-"}</td>
              <td className="muted">
                {p.is_noindex && "noindex "}
                {p.is_orphan && "orphan "}
                {p.has_structured_data && "schema "}
              </td>
            </tr>
          ))}
          {pages.length === 0 && (
            <tr>
              <td colSpan={6} className="muted">
                No pages crawled yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <h2>SEO audit — issues ({issues.length} open)</h2>
      {latestAudit && (
        <p className="muted">
          Latest audit: {latestAudit.status} &middot; {latestAudit.pages_analyzed} pages analyzed &middot;{" "}
          {latestAudit.completed_at ? new Date(latestAudit.completed_at).toLocaleString() : "in progress"}
        </p>
      )}
      <div className="notice">
        Technical checks only (titles, meta, headings, links, indexing, sitewide files). This is not a complete SEO
        assessment — off-page factors like backlinks and real ranking data aren't covered yet.
      </div>
      {issuesBySeverity.map(
        ({ severity, items }) =>
          items.length > 0 && (
            <div key={severity}>
              <h3>
                <span className={`badge ${severity}`}>{severity}</span> ({items.length})
              </h3>
              <table>
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Description</th>
                    <th>Recommended action</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((issue) => (
                    <tr key={issue.id}>
                      <td>{issue.issue_type}</td>
                      <td>{issue.description}</td>
                      <td>{issue.recommended_action}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
      )}
      {issues.length === 0 && <p className="muted">No open issues. Run an audit after crawling.</p>}

      <h2>AI opportunities ({opportunities.length})</h2>
      <div className="notice">
        AI-generated recommendations based only on crawled/audited data — no search volume, ranking, or competitor
        data was used. Treat as a starting point, not verified market data.
      </div>
      <table>
        <thead>
          <tr>
            <th>Type</th>
            <th>Title</th>
            <th>Rationale</th>
            <th>Priority</th>
            <th>Effort</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {opportunities.map((o) => (
            <tr key={o.id}>
              <td>{o.type}</td>
              <td>{o.title}</td>
              <td className="muted">{o.rationale}</td>
              <td>{o.priority_score}</td>
              <td>{o.effort_estimate}</td>
              <td>
                <span className={`badge ${o.status}`}>{o.status}</span>
              </td>
            </tr>
          ))}
          {opportunities.length === 0 && (
            <tr>
              <td colSpan={6} className="muted">
                No opportunities generated yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <h2>Tasks ({tasks.length})</h2>
      {tasksByStatus.map(
        ({ status, items }) =>
          items.length > 0 && (
            <div key={status}>
              <h3>
                <span className={`badge ${status}`}>{status}</span> ({items.length})
              </h3>
              <table>
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Type</th>
                    <th>Priority</th>
                    <th>Change status</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((task) => (
                    <tr key={task.id}>
                      <td>{task.title}</td>
                      <td>{task.type}</td>
                      <td>{task.priority}</td>
                      <td>
                        <form action={updateTaskStatusAction} className="row">
                          <input type="hidden" name="task_id" value={task.id} />
                          <input type="hidden" name="website_id" value={website.id} />
                          <select name="status" defaultValue={task.status}>
                            {TASK_STATUSES.map((s) => (
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
      )}
      {tasks.length === 0 && <p className="muted">No tasks yet.</p>}
    </>
  );
}
