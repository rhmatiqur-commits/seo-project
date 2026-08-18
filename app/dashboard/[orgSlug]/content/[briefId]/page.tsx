import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrganizationMembership } from "@/lib/auth/session";
import { assertOwnedByOrganization } from "@/lib/api/authorize";
import { getContentBrief, listContentJobsForBrief, listContentVersionsForBrief, getLatestQaResultForVersion } from "@/lib/db/content";
import { getCmsConnectionForWebsite } from "@/lib/db/cms-connections";
import { getPublicationForVersion } from "@/lib/db/content-publications";
import { toPublicConnection } from "@/lib/publishing/connection-view";
import { availableContentActions } from "@/lib/content/state-machine";
import { canApproveContent, canEditContent, canPreparePublication, canPublishToProduction } from "@/lib/auth/permissions";
import { generateContentAction, reviseContentAction, approveContentDashboardAction, rejectContentDashboardAction, preparePublicationAction, approveProductionMergeAction } from "@/app/dashboard/actions";
import type { ContentBrief } from "@/lib/content/brief-types";

export const dynamic = "force-dynamic";

function fmt(date: string | null): string {
  return date ? new Date(date).toLocaleString() : "-";
}

export default async function ContentBriefDashboardPage({ params }: { params: Promise<{ orgSlug: string; briefId: string }> }) {
  const { orgSlug, briefId } = await params;
  const { organization, membership } = await requireOrganizationMembership(orgSlug);

  const briefRow = await getContentBrief(briefId);
  assertOwnedByOrganization(briefRow, organization.id, "ContentBrief", briefId);
  if (!briefRow) notFound();

  const [jobs, versions] = await Promise.all([listContentJobsForBrief(briefRow.id), listContentVersionsForBrief(briefRow.id)]);
  const latestJob = jobs[0] ?? null;
  const latestVersion = versions[versions.length - 1] ?? null;
  const latestQa = latestVersion ? await getLatestQaResultForVersion(latestVersion.id) : null;
  const [connectionRow, publication] = await Promise.all([
    getCmsConnectionForWebsite(briefRow.website_id),
    latestVersion ? getPublicationForVersion(latestVersion.id) : Promise.resolve(null),
  ]);
  const connection = connectionRow ? toPublicConnection(connectionRow) : null;

  const brief = briefRow.brief_data as unknown as ContentBrief;
  const actions = latestJob ? availableContentActions(latestJob.status) : { canApprove: false, canReject: false, canRevise: false };
  const canGenerate = canEditContent(membership.role) && (!latestJob || latestJob.status === "APPROVED" || latestJob.status === "REJECTED");
  const canReview = canApproveContent(membership.role);
  const canRevise = canEditContent(membership.role) && actions.canRevise;
  const canPublishNow = latestJob?.status === "APPROVED" && connection?.status === "active";

  return (
    <>
      <p>
        <Link href={`/dashboard/${orgSlug}/content`}>&larr; Content</Link>
      </p>
      <h1 className="dash-page-title">{briefRow.primary_keyword ?? brief.opportunity.title}</h1>
      <p className="dash-page-subtitle">
        {briefRow.content_type === "CREATE_NEW_PAGE" ? "New page" : "Page update"} &middot; target: {briefRow.target_url ?? "not yet resolved"}
      </p>

      <div className="dash-card" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <span className={`dash-badge ${latestJob?.status === "APPROVED" ? "success" : "info"}`}>{latestJob?.status.replace(/_/g, " ") ?? "Not started"}</span>
          {latestQa && <span className={`dash-badge ${latestQa.passed ? "success" : "danger"}`}>QA {latestQa.passed ? "passed" : "failed"} ({latestQa.score})</span>}
        </div>
        <div className="dash-row" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {canGenerate && (
            <form action={generateContentAction}>
              <input type="hidden" name="org_slug" value={orgSlug} />
              <input type="hidden" name="content_brief_id" value={briefRow.id} />
              <button className="dash-btn secondary" type="submit">
                {latestJob ? "Generate new attempt" : "Generate content"}
              </button>
            </form>
          )}
          {latestJob && canReview && (
            <>
              <form action={approveContentDashboardAction}>
                <input type="hidden" name="org_slug" value={orgSlug} />
                <input type="hidden" name="content_job_id" value={latestJob.id} />
                <button className="dash-btn" type="submit" disabled={!actions.canApprove}>
                  Approve
                </button>
              </form>
              <form action={rejectContentDashboardAction}>
                <input type="hidden" name="org_slug" value={orgSlug} />
                <input type="hidden" name="content_job_id" value={latestJob.id} />
                <button className="dash-btn secondary" type="submit" disabled={!actions.canReject}>
                  Reject
                </button>
              </form>
            </>
          )}
        </div>
        {latestJob && canRevise && (
          <form action={reviseContentAction} style={{ marginTop: 12, display: "flex", gap: 8 }}>
            <input type="hidden" name="org_slug" value={orgSlug} />
            <input type="hidden" name="content_job_id" value={latestJob.id} />
            <input type="text" name="additional_instructions" placeholder="Optional: what should change?" style={{ flex: 1 }} />
            <button className="dash-btn secondary" type="submit">
              Request changes
            </button>
          </form>
        )}
      </div>

      {latestVersion && (
        <div className="dash-card" style={{ marginBottom: 20 }}>
          <h2 style={{ marginTop: 0, fontSize: "1rem" }}>
            {(latestVersion.metadata as { seoTitle?: string }).seoTitle ?? latestVersion.title ?? "Draft"}
          </h2>
          <p className="dash-muted" style={{ fontSize: "0.85rem" }}>
            {(latestVersion.metadata as { metaDescription?: string }).metaDescription ?? "No meta description yet."}
          </p>
          {latestQa && !latestQa.passed && (
            <div className="dash-notice danger">
              This draft needs changes before it can be approved.
              {(latestQa.issues as unknown as { message: string }[]).slice(0, 5).map((issue, i) => (
                <div key={i}>&bull; {issue.message}</div>
              ))}
            </div>
          )}
          <div style={{ whiteSpace: "pre-wrap", fontSize: "0.88rem", lineHeight: 1.6, background: "var(--dash-bg)", padding: 14, borderRadius: "var(--dash-radius-sm)", maxHeight: 420, overflowY: "auto" }}>
            {latestVersion.content}
          </div>
          <p className="dash-muted" style={{ fontSize: "0.78rem", marginTop: 8 }}>
            Version {latestVersion.version_number} &middot; generated {fmt(latestVersion.created_at)}
          </p>
        </div>
      )}

      {!latestVersion && <p className="dash-empty">No draft generated yet.</p>}

      <div className="dash-card">
        <h2 style={{ marginTop: 0, fontSize: "1rem" }}>Publishing</h2>
        {!connection && <p className="dash-muted">No publishing connection configured — see Settings.</p>}
        {connection && latestVersion && (
          <>
            <p className="dash-muted" style={{ fontSize: "0.85rem" }}>
              {publication ? (
                <>
                  Status: <span className="dash-badge">{publication.status.replace(/_/g, " ")}</span>
                  {publication.pull_request_url && (
                    <>
                      {" "}
                      &middot; <a href={publication.pull_request_url} target="_blank" rel="noreferrer">View pull request &rarr;</a>
                    </>
                  )}
                  {publication.preview_url && (
                    <>
                      {" "}
                      &middot; <a href={publication.preview_url} target="_blank" rel="noreferrer">View preview &rarr;</a>
                    </>
                  )}
                  {publication.target_url && publication.status === "PUBLISHED" && (
                    <>
                      {" "}
                      &middot; <a href={publication.target_url} target="_blank" rel="noreferrer">View live page &rarr;</a>
                    </>
                  )}
                </>
              ) : (
                "Not yet prepared for publishing."
              )}
            </p>
            {publication?.error && <div className="dash-notice danger">{publication.error}</div>}
            <div className="dash-row" style={{ display: "flex", gap: 8 }}>
              {canPreparePublication(membership.role) && (
                <form action={preparePublicationAction}>
                  <input type="hidden" name="org_slug" value={orgSlug} />
                  <input type="hidden" name="content_version_id" value={latestVersion.id} />
                  <button className="dash-btn secondary" type="submit" disabled={!canPublishNow}>
                    {publication?.status === "FAILED" ? "Retry: Prepare publication" : "Prepare publication"}
                  </button>
                </form>
              )}
              {canPublishToProduction(membership.role) && (
                <form action={approveProductionMergeAction}>
                  <input type="hidden" name="org_slug" value={orgSlug} />
                  <input type="hidden" name="content_version_id" value={latestVersion.id} />
                  <button className="dash-btn" type="submit" disabled={!canPublishNow || (connection.provider === "github" && !publication?.pull_request_number)}>
                    Approve &amp; publish to production
                  </button>
                </form>
              )}
            </div>
            <p className="dash-muted" style={{ fontSize: "0.78rem", marginTop: 8 }}>
              &quot;Prepare publication&quot; never makes the page public — it opens a preview for you to review. &quot;Approve &amp; publish&quot; is the only action that makes it live.
            </p>
          </>
        )}
      </div>
    </>
  );
}
