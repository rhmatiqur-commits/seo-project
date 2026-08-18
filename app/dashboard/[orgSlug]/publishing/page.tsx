import Link from "next/link";
import { requireOrganizationMembership } from "@/lib/auth/session";
import { getPrimaryWebsiteForOrganization } from "@/lib/dashboard/website";
import { listPublicationsForWebsite } from "@/lib/db/content-publications";
import { getCmsConnectionForWebsite } from "@/lib/db/cms-connections";
import { toPublicConnection } from "@/lib/publishing/connection-view";
import { getContentVersionById } from "@/lib/db/content";

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
          ? "GitHub-based publishing: approved content becomes a pull request and a preview deployment before you approve it going live."
          : "Approved content is published to your connected site."}
      </p>

      {!connection && (
        <div className="dash-notice warning">
          No publishing connection is set up yet — visit <Link href={`/dashboard/${orgSlug}/settings`}>Settings</Link> to connect one.
        </div>
      )}
      {connection && (
        <div className="dash-card" style={{ marginBottom: 20 }}>
          {connection.provider === "github" ? (
            <p style={{ margin: 0 }}>
              Repository: <strong>{(connectionRow as { github_owner?: string; github_repo?: string })?.github_owner}/{(connectionRow as { github_repo?: string })?.github_repo}</strong>{" "}
              &middot; production branch: <strong>{(connectionRow as { github_production_branch?: string })?.github_production_branch}</strong> &middot;{" "}
              <span className={`dash-badge ${connection.status === "active" ? "success" : "warning"}`}>{connection.status}</span>
            </p>
          ) : (
            <p style={{ margin: 0 }}>
              Connected to <strong>{connection.baseUrl}</strong> &middot; <span className={`dash-badge ${connection.status === "active" ? "success" : "warning"}`}>{connection.status}</span>
            </p>
          )}
        </div>
      )}

      {publications.length === 0 && <p className="dash-empty">Nothing published yet.</p>}

      <table className="dash-table">
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
                <td>{briefId ? <Link href={`/dashboard/${orgSlug}/content/${briefId}`}>{p.target_url ?? "Untitled page"}</Link> : p.target_url ?? "Untitled page"}</td>
                <td>
                  <span className={`dash-badge ${STATUS_TONE[p.status] ?? "info"}`}>{p.status.replace(/_/g, " ")}</span>
                </td>
                <td className="dash-muted" style={{ fontSize: "0.82rem" }}>
                  {p.pull_request_url && (
                    <a href={p.pull_request_url} target="_blank" rel="noreferrer">
                      Pull request &rarr;
                    </a>
                  )}
                  {p.pull_request_url && p.preview_url && " · "}
                  {p.preview_url && (
                    <a href={p.preview_url} target="_blank" rel="noreferrer">
                      Preview &rarr;
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
                <td className="dash-muted">{fmt(p.updated_at)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}
