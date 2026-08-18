import Link from "next/link";
import { requireOrganizationMembership } from "@/lib/auth/session";
import { getPrimaryWebsiteForOrganization } from "@/lib/dashboard/website";
import { listContentBriefsForWebsite, listContentJobsForBrief, getLatestContentVersionForBrief, getLatestQaResultForVersion } from "@/lib/db/content";
import { canApproveContent } from "@/lib/auth/permissions";
import { approveContentDashboardAction } from "@/app/dashboard/actions";
import { SubmitButton } from "@/app/dashboard/_components/SubmitButton";
import { EmptyState } from "@/app/dashboard/_components/EmptyState";
import { contentStatusLabel } from "@/lib/dashboard/status-labels";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, string> = {
  DRAFT: "info",
  QA_PENDING: "warning",
  QA_FAILED: "danger",
  NEEDS_REVIEW: "warning",
  READY_FOR_APPROVAL: "warning",
  APPROVED: "success",
  REJECTED: "danger",
};

/**
 * Phase 7.1B: prioritises Title / Target keyword / Status / QA / Approval
 * action per the spec — QA and an inline Approve button are new to this
 * list (previously only on the brief's own detail page), reusing the exact
 * same lib/db functions and Server Action the detail page already calls;
 * no new data model, no internal IDs shown.
 */
export default async function ContentListPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { organization, membership } = await requireOrganizationMembership(orgSlug);
  const website = await getPrimaryWebsiteForOrganization(organization.id);
  const briefs = website ? await listContentBriefsForWebsite(website.id) : [];
  const canApprove = canApproveContent(membership.role);

  const rows = await Promise.all(
    briefs.map(async (b) => {
      const jobs = await listContentJobsForBrief(b.id);
      const job = jobs[0] ?? null;
      const latestVersion = await getLatestContentVersionForBrief(b.id);
      const qa = latestVersion ? await getLatestQaResultForVersion(latestVersion.id) : null;
      return { brief: b, job, qa };
    })
  );

  return (
    <>
      <h1 className="dash-page-title">Content</h1>
      <p className="dash-page-subtitle">Pages being written for your site, from brief through approval.</p>

      {briefs.length === 0 && <EmptyState title="No content briefs yet" description="Briefs are created automatically when you accept an opportunity that needs a new or updated page." />}

      {briefs.length > 0 && (
        <div className="dash-table-wrap">
          <table className="dash-table responsive">
            <thead>
              <tr>
                <th>Page</th>
                <th>Target keyword</th>
                <th>Status</th>
                <th>QA</th>
                {canApprove && <th>Approval</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ brief: b, job, qa }) => (
                <tr key={b.id}>
                  <td data-label="Page">
                    <Link href={`/dashboard/${orgSlug}/content/${b.id}`}>{b.target_url ?? b.primary_keyword ?? "Untitled brief"}</Link>
                  </td>
                  <td className="dash-muted" data-label="Target keyword">{b.primary_keyword ?? "-"}</td>
                  <td data-label="Status">
                    <span className={`dash-badge ${job ? STATUS_TONE[job.status] ?? "info" : "info"}`}>{job ? contentStatusLabel(job.status) : "Not started"}</span>
                  </td>
                  <td data-label="QA">
                    {qa ? <span className={`dash-badge ${qa.passed ? "success" : "danger"}`}>{qa.passed ? "Passed" : "Needs changes"}</span> : <span className="dash-muted">-</span>}
                  </td>
                  {canApprove && (
                    <td data-label="Approval">
                      {job?.status === "READY_FOR_APPROVAL" ? (
                        <form action={approveContentDashboardAction}>
                          <input type="hidden" name="org_slug" value={orgSlug} />
                          <input type="hidden" name="content_job_id" value={job.id} />
                          <SubmitButton variant="secondary" pendingLabel="Approving…" style={{ padding: "4px 10px", fontSize: "0.78rem" }}>
                            Approve
                          </SubmitButton>
                        </form>
                      ) : (
                        <span className="dash-muted">-</span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
