import Link from "next/link";
import { requireOrganizationMembership } from "@/lib/auth/session";
import { getPrimaryWebsiteForOrganization } from "@/lib/dashboard/website";
import { listPublicationsForWebsite } from "@/lib/db/content-publications";
import { getCmsConnectionForWebsite } from "@/lib/db/cms-connections";
import { toPublicConnection } from "@/lib/publishing/connection-view";
import { getContentVersionById } from "@/lib/db/content";
import { publicationStatusLabel } from "@/lib/dashboard/status-labels";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, string> = {
  PENDING: "info",
  PUBLISHING: "warning",
  BRANCH_CREATED: "warning",
  COMMITTED: "warning",
  PR_CREATED: "warning",
  PREVIEW_READY: "warning",
  AWAITING_PRODUCTION_APPROVAL: "warning",
  MERGING: "warning",
  DEPLOYING: "warning",
  DRAFTED: "info",
  PUBLISHED: "success",
  FAILED: "danger",
  UNPUBLISHED: "danger",
};

function fmt(date: string | null): string {
  return date ? new Date(date).toLocaleString() : "-";
}

export default async function PublishingPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { organization } = await requireOrganizationMembership(orgSlug);
  const website = await getPrimaryWebsiteForOrganization(organization.id);
  const [connectionRow, publications] = website
    ? await Promise.all([getCmsConnectionForWebsite(website.id), listPublicationsForWebsite(website.id, 30)])
    : [null, []];
  const connection = connectionRow ? toPublicConnection(connectionRow) : null;
  const briefIdByVersion = new Map(
    await Promise.all(
      publications.map(async (p) => {
        const version = await getContentVersionById(p.content_version_id);
        return [p.content_version_id, version?.content_brief_id ?? null] as const;
      })
    )
  );

  return (
    <>
      <h1 className="dash-page-title">Publishing</h1>
      <p className="dash-page-subtitle">
        {connection?.provider === "github"
          ? "Approved content becomes a preview you can review before you approve it going live."
          : "Approved content is published to your connected site."}
      </p>

      {!connection && (
        <div className="dash-notice warning">
          No publishing connection is set up yet — visit <Link href={`/dashboard/${orgSlug}/settings`}>Settings</Link> to connect one.
        </div>
      )}
      {connection && (
        <div className="dash-card" style={{ marginBottom: 20 }}>
          <p style={{ margin: 0 }}>
            Connected and <span className={`dash-badge ${connection.status === "active" ? "success" : "warning"}`}>{connection.status === "active" ? "ready" : connection.status}</span>
          </p>
          {connection.provider === "github" && (
            <details className="dash-tech-details" style={{ marginTop: 10 }}>
              <summary>Technical details</summary>
              <div className="dash-tech-details-body">
                Repository: <strong>{(connectionRow as { github_owner?: string; github_repo?: string })?.github_owner}/{(connectionRow as { github_repo?: string })?.github_repo}</strong>
                {" "}&middot; production branch: <strong>{(connectionRow as { github_production_branch?: string })?.github_production_branch}</strong>
              </div>
            </details>
          )}
          {connection.provider !== "github" && (
            <p className="dash-muted" style={{ marginTop: 4, marginBottom: 0 }}>
              Connected to <strong>{connection.baseUrl}</strong>
            </p>
          )}
        </div>
      )}

      {publications.length === 0 && (
        <div className="dash-empty-state">
          <div className="mark" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M9 12V4M6 7l3-3 3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              <path d="M3 12.5v1.5A1 1 0 004 15h10a1 1 0 001-1v-1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none" />
            </svg>
          </div>
          <h3>No content has been published yet</h3>
          <p>Once you approve content, here&apos;s how it reaches your live site:</p>
          <div className="dash-workflow-explainer">
            <span className="dash-workflow-step">Approved</span>
            <span className="dash-workflow-arrow">&rarr;</span>
            <span className="dash-workflow-step">Preview created</span>
            <span className="dash-workflow-arrow">&rarr;</span>
            <span className="dash-workflow-step">Your review</span>
            <span className="dash-workflow-arrow">&rarr;</span>
            <span className="dash-workflow-step">Live</span>
          </div>
        </div>
      )}

      {publications.length > 0 && (
        <div className="dash-table-wrap">
          <table className="dash-table responsive">
            <thead>
              <tr>
                <th>Page</th>
                <th>Status</th>
                <th>Links</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {publications.map((p) => {
                const briefId = briefIdByVersion.get(p.content_version_id);
                return (
                  <tr key={p.id}>
                    <td data-label="Page">{briefId ? <Link href={`/dashboard/${orgSlug}/content/${briefId}`}>{p.target_url ?? "Untitled page"}</Link> : p.target_url ?? "Untitled page"}</td>
                    <td data-label="Status">
                      <span className={`dash-badge ${STATUS_TONE[p.status] ?? "info"}`}>{publicationStatusLabel(p.status)}</span>
                    </td>
                    <td className="dash-muted" style={{ fontSize: "0.82rem" }} data-label="Links">
                      {p.pull_request_url && (
                        <a href={p.pull_request_url} target="_blank" rel="noreferrer">
                          Review changes &rarr;
                        </a>
                      )}
                      {p.pull_request_url && p.preview_url && " · "}
                      {p.preview_url && (
                        <a href={p.preview_url} target="_blank" rel="noreferrer">
                          Preview site &rarr;
                        </a>
                      )}
                      {(p.pull_request_url || p.preview_url) && p.status === "PUBLISHED" && " · "}
                      {p.status === "PUBLISHED" && p.target_url && (
                        <a href={p.target_url} target="_blank" rel="noreferrer">
                          Live page &rarr;
                        </a>
                      )}
                      {!p.pull_request_url && !p.preview_url && p.status !== "PUBLISHED" && "-"}
                    </td>
                    <td className="dash-muted" data-label="Updated">{fmt(p.updated_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
