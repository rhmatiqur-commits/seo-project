import Link from "next/link";
import { notFound } from "next/navigation";
import { getWebsite } from "@/lib/db/websites";
import { getOpportunity } from "@/lib/db/opportunities";
import { getContentBrief, listContentJobsForBrief, listContentVersionsForBrief, getLatestQaResultForVersion } from "@/lib/db/content";
import { availableContentActions } from "@/lib/content/state-machine";
import { generateContentAction, runContentQaAction, reviseContentAction, approveContentAction, rejectContentAction } from "@/app/admin/actions";
import type { ContentBrief } from "@/lib/content/brief-types";

export const dynamic = "force-dynamic";

function fmt(date: string | null): string {
  return date ? new Date(date).toLocaleString() : "-";
}

export default async function ContentBriefPage({ params }: { params: Promise<{ id: string; briefId: string }> }) {
  const { id, briefId } = await params;
  const website = await getWebsite(id);
  if (!website) notFound();
  const briefRow = await getContentBrief(briefId);
  if (!briefRow || briefRow.website_id !== website.id) notFound();

  const [opportunity, jobs, versions] = await Promise.all([
    getOpportunity(briefRow.seo_opportunity_id),
    listContentJobsForBrief(briefRow.id),
    listContentVersionsForBrief(briefRow.id),
  ]);
  const latestJob = jobs[0] ?? null;
  const qaResultsByVersion = new Map(await Promise.all(versions.map(async (v) => [v.id, await getLatestQaResultForVersion(v.id)] as const)));

  const brief = briefRow.brief_data as unknown as ContentBrief;
  const actions = latestJob ? availableContentActions(latestJob.status) : { canApprove: false, canReject: false, canRevise: false };
  const canGenerate = !latestJob || latestJob.status === "APPROVED" || latestJob.status === "REJECTED";
  const canRunQa = latestJob?.status === "QA_PENDING";

  return (
    <>
      <p className="row">
        <Link href={`/admin/websites/${website.id}/content`}>&larr; Content — {website.name}</Link>
        {opportunity && <Link href={`/admin/websites/${website.id}/search-performance`}>SEO opportunity &rarr;</Link>}
      </p>
      <h1>{briefRow.primary_keyword ?? "Content brief"}</h1>
      <p className="muted">
        {briefRow.content_type} &middot; target: {briefRow.target_url ?? "-"} &middot; brief status:{" "}
        <span className={`badge ${briefRow.status}`}>{briefRow.status}</span>
        {latestJob && (
          <>
            {" "}
            &middot; pipeline status: <span className={`badge ${latestJob.status}`}>{latestJob.status}</span> &middot; revisions used: {latestJob.attempts}
          </>
        )}
      </p>

      {opportunity && (
        <div className="card">
          <h2>SEO opportunity</h2>
          <p>
            <strong>{opportunity.title}</strong>
          </p>
          <p className="muted">{opportunity.rationale}</p>
          {briefRow.seo_task_id && <p className="muted">Traceable task: {briefRow.seo_task_id}</p>}
        </div>
      )}

      <div className="card row">
        <form action={generateContentAction}>
          <input type="hidden" name="content_brief_id" value={briefRow.id} />
          <input type="hidden" name="website_id" value={website.id} />
          <input type="hidden" name="organization_id" value={website.organization_id} />
          <button className="btn" type="submit" disabled={!canGenerate}>
            {latestJob ? "Generate new attempt" : "Generate content"}
          </button>
        </form>
        {latestJob && (
          <>
            <form action={runContentQaAction}>
              <input type="hidden" name="content_job_id" value={latestJob.id} />
              <input type="hidden" name="website_id" value={website.id} />
              <input type="hidden" name="organization_id" value={website.organization_id} />
              <button className="btn secondary" type="submit" disabled={!canRunQa}>
                Run QA
              </button>
            </form>
            <form action={approveContentAction}>
              <input type="hidden" name="content_job_id" value={latestJob.id} />
              <input type="hidden" name="website_id" value={website.id} />
              <input type="hidden" name="organization_id" value={website.organization_id} />
              <button className="btn secondary" type="submit" disabled={!actions.canApprove}>
                Approve
              </button>
            </form>
            <form action={rejectContentAction}>
              <input type="hidden" name="content_job_id" value={latestJob.id} />
              <input type="hidden" name="website_id" value={website.id} />
              <input type="hidden" name="organization_id" value={website.organization_id} />
              <button className="btn secondary" type="submit" disabled={!actions.canReject}>
                Reject
              </button>
            </form>
          </>
        )}
      </div>

      {latestJob && actions.canRevise && (
        <div className="card">
          <form action={reviseContentAction} className="row">
            <input type="hidden" name="content_job_id" value={latestJob.id} />
            <input type="hidden" name="website_id" value={website.id} />
            <input type="hidden" name="organization_id" value={website.organization_id} />
            <textarea name="additional_instructions" placeholder="Optional extra instructions for this revision" rows={2} style={{ flex: 1, minWidth: "20rem" }} />
            <button className="btn secondary" type="submit">
              Revise
            </button>
          </form>
        </div>
      )}

      <h2>Brief</h2>
      <div className="card">
        <p>
          <strong>Search intent:</strong> {brief.searchIntent ?? "-"} &middot; <strong>Target location:</strong> {brief.targetLocation ?? "-"}
        </p>
        {brief.secondaryKeywords.length > 0 && (
          <p>
            <strong>Secondary keywords:</strong> {brief.secondaryKeywords.map((k) => k.text).join(", ")}
          </p>
        )}
        {brief.existingPage && (
          <p>
            <strong>Existing page:</strong> {brief.existingPage.url} ({brief.existingPage.wordCount ?? "?"} words)
          </p>
        )}
        {brief.contentGaps.length > 0 && (
          <>
            <p>
              <strong>Content gaps</strong>
            </p>
            <ul>
              {brief.contentGaps.map((g, i) => (
                <li key={i}>{g}</li>
              ))}
            </ul>
          </>
        )}
        {brief.recommendedTopics.length > 0 && (
          <p>
            <strong>Recommended topics:</strong> {brief.recommendedTopics.join(", ")}
          </p>
        )}
        {brief.competitorPages.length > 0 && (
          <>
            <p>
              <strong>Competitor pages</strong> (structured metadata only — never their body text)
            </p>
            <ul>
              {brief.competitorPages.map((c, i) => (
                <li key={i}>
                  {c.domain} — {c.url} ({c.wordCount ?? "?"} words){c.majorTopics.length > 0 ? `: ${c.majorTopics.join(", ")}` : ""}
                </li>
              ))}
            </ul>
          </>
        )}
        {brief.internalLinkOpportunities.length > 0 && (
          <>
            <p>
              <strong>Suggested internal links</strong> (real existing pages only)
            </p>
            <ul>
              {brief.internalLinkOpportunities.map((l, i) => (
                <li key={i}>
                  {l.sourcePageUrl} (relevance {l.relevanceScore})
                </li>
              ))}
            </ul>
          </>
        )}
        {brief.missingBusinessInfo.length > 0 && (
          <div className="notice">
            <strong>Not configured — never invented:</strong>
            <ul>
              {brief.missingBusinessInfo.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <h2>Versions ({versions.length})</h2>
      {[...versions].reverse().map((v) => {
        const qa = qaResultsByVersion.get(v.id);
        const metadata = v.metadata as { seoTitle?: string; metaDescription?: string; suggestedUrl?: string; h1?: string };
        return (
          <details key={v.id} className="card" open={v.version_number === versions.length}>
            <summary>
              Version {v.version_number} &middot; <span className={`badge ${v.qa_status}`}>{v.qa_status}</span>
              {qa && ` · score ${qa.score}`} &middot; {fmt(v.created_at)}
            </summary>
            <p className="muted">
              <strong>SEO title:</strong> {metadata.seoTitle ?? v.title ?? "-"} <br />
              <strong>Meta description:</strong> {metadata.metaDescription ?? "-"} <br />
              <strong>Suggested URL:</strong> {metadata.suggestedUrl ?? "-"} <br />
              <strong>H1:</strong> {metadata.h1 ?? "-"}
            </p>
            {qa && (
              <div className="notice">
                <strong>QA: {qa.passed ? "PASSED" : "FAILED"}</strong> (score {qa.score})
                <ul>
                  {(qa.issues as unknown as { severity: string; category: string; message: string }[]).map((issue, i) => (
                    <li key={i}>
                      <span className={`badge ${issue.severity}`}>{issue.severity}</span> {issue.category}: {issue.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <pre style={{ whiteSpace: "pre-wrap", background: "#fafafa", padding: "10px", borderRadius: "6px" }}>{v.content}</pre>
          </details>
        );
      })}
      {versions.length === 0 && <p className="muted">No draft generated yet.</p>}
    </>
  );
}
