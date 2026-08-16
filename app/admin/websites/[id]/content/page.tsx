import Link from "next/link";
import { notFound } from "next/navigation";
import { getWebsite } from "@/lib/db/websites";
import { listOpportunitiesForWebsite } from "@/lib/db/opportunities";
import { listContentBriefsForWebsite, listContentJobsForBrief } from "@/lib/db/content";
import { isContentEligibleOpportunityType } from "@/lib/content/eligibility";
import { createContentBriefAction, updateContentProfileAction } from "@/app/admin/actions";

export const dynamic = "force-dynamic";

function fmt(date: string | null): string {
  return date ? new Date(date).toLocaleString() : "-";
}

export default async function WebsiteContentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const website = await getWebsite(id);
  if (!website) notFound();

  const [opportunities, briefs] = await Promise.all([listOpportunitiesForWebsite(website.id), listContentBriefsForWebsite(website.id)]);

  const briefedOpportunityIds = new Set(briefs.map((b) => b.seo_opportunity_id));
  const eligibleOpportunities = opportunities.filter((o) => isContentEligibleOpportunityType(o.type) && !briefedOpportunityIds.has(o.id));

  const jobsByBrief = new Map(await Promise.all(briefs.map(async (b) => [b.id, await listContentJobsForBrief(b.id)] as const)));

  return (
    <>
      <p className="row">
        <Link href={`/admin/websites/${website.id}`}>&larr; {website.name}</Link>
      </p>
      <h1>Content Execution — {website.name}</h1>

      <div className="notice">
        SEO opportunity &rarr; content brief &rarr; generated draft &rarr; QA &rarr; revisions &rarr; human approval. Nothing here
        is ever published automatically — approval only means &quot;ready for Phase 5 publishing&quot;.
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Business profile</h2>
        <p className="muted">
          Read by every content brief — a blank field is never invented, it&apos;s flagged for review instead (see &quot;Not
          configured&quot; on each brief).
        </p>
        <form action={updateContentProfileAction}>
          <input type="hidden" name="website_id" value={website.id} />
          <div className="row" style={{ alignItems: "flex-start" }}>
            <label style={{ flex: 1, minWidth: "20rem" }}>
              Business description
              <br />
              <textarea name="business_description" defaultValue={website.business_description ?? ""} rows={2} style={{ width: "100%" }} />
            </label>
            <label style={{ flex: 1, minWidth: "20rem" }}>
              Target audience
              <br />
              <textarea name="target_audience" defaultValue={website.target_audience ?? ""} rows={2} style={{ width: "100%" }} />
            </label>
          </div>
          <div className="row" style={{ alignItems: "flex-start", marginTop: "8px" }}>
            <label style={{ flex: 1, minWidth: "20rem" }}>
              Brand voice
              <br />
              <textarea name="brand_voice" defaultValue={website.brand_voice ?? ""} rows={2} style={{ width: "100%" }} />
            </label>
            <label style={{ flex: 1, minWidth: "20rem" }}>
              Content constraints (things to never claim, required disclaimers, etc.)
              <br />
              <textarea name="content_constraints" defaultValue={website.content_constraints ?? ""} rows={2} style={{ width: "100%" }} />
            </label>
          </div>
          <p>
            <button className="btn secondary" type="submit">
              Save business profile
            </button>
          </p>
        </form>
      </div>

      <h2>Eligible opportunities without a brief yet ({eligibleOpportunities.length})</h2>
      <p className="muted">Only CREATE_NEW_PAGE and OPTIMISE_EXISTING_PAGE opportunities support content execution.</p>
      <table>
        <thead>
          <tr>
            <th>Type</th>
            <th>Title</th>
            <th>Priority</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {eligibleOpportunities.map((o) => (
            <tr key={o.id}>
              <td>{o.type}</td>
              <td>{o.title}</td>
              <td>{o.priority_score}</td>
              <td>
                <form action={createContentBriefAction}>
                  <input type="hidden" name="opportunity_id" value={o.id} />
                  <input type="hidden" name="website_id" value={website.id} />
                  <input type="hidden" name="organization_id" value={website.organization_id} />
                  <button className="btn" type="submit">
                    Generate brief
                  </button>
                </form>
              </td>
            </tr>
          ))}
          {eligibleOpportunities.length === 0 && (
            <tr>
              <td colSpan={4} className="muted">
                No eligible opportunities without a brief. Generate SEO opportunities first (see the SEO Decision Engine page).
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <h2>Content briefs ({briefs.length})</h2>
      <table>
        <thead>
          <tr>
            <th>Primary keyword</th>
            <th>Type</th>
            <th>Target URL</th>
            <th>Status</th>
            <th>Latest job status</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          {briefs.map((b) => {
            const jobs = jobsByBrief.get(b.id) ?? [];
            const latestJob = jobs[0];
            return (
              <tr key={b.id}>
                <td>
                  <Link href={`/admin/websites/${website.id}/content/${b.id}`}>{b.primary_keyword ?? "(no keyword)"}</Link>
                </td>
                <td className="muted">{b.content_type}</td>
                <td className="muted">{b.target_url ?? "-"}</td>
                <td>
                  <span className={`badge ${b.status}`}>{b.status}</span>
                </td>
                <td>{latestJob ? <span className={`badge ${latestJob.status}`}>{latestJob.status}</span> : <span className="muted">not started</span>}</td>
                <td className="muted">{fmt(b.created_at)}</td>
              </tr>
            );
          })}
          {briefs.length === 0 && (
            <tr>
              <td colSpan={6} className="muted">
                No content briefs yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </>
  );
}
