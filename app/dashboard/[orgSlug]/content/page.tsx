import Link from "next/link";
import { requireOrganizationMembership } from "@/lib/auth/session";
import { getPrimaryWebsiteForOrganization } from "@/lib/dashboard/website";
import { listContentBriefsForWebsite, listContentJobsForBrief, getLatestContentVersionForBrief, getLatestQaResultForVersion } from "@/lib/db/content";
import { canApproveContent } from "@/lib/auth/permissions";
import { approveContentDashboardAction } from "@/app/dashboard/actions";
import { SubmitButton } from "@/app/dashboard/_components/SubmitButton";
import { EmptyState } from "@/app/dashboard/_components/EmptyState";
import { contentStatusLabel } from "@/lib/dashboard/status-labels";
import { contentAttentionBucket } from "@/lib/dashboard/content-status";
import type { Database } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

type ContentBriefRow = Database["public"]["Tables"]["content_briefs"]["Row"];
type ContentJobRow = Database["public"]["Tables"]["content_jobs"]["Row"];
type ContentQaResultRow = Database["public"]["Tables"]["content_qa_results"]["Row"];

interface ContentRow {
  brief: ContentBriefRow;
  job: ContentJobRow | null;
  qa: ContentQaResultRow | null;
}

const STATUS_TONE: Record<string, string> = {
  DRAFT: "info",
  QA_PENDING: "warning",
  QA_FAILED: "danger",
  NEEDS_REVIEW: "warning",
  READY_FOR_APPROVAL: "warning",
  APPROVED: "success",
  REJECTED: "danger",
};

/** Phase 7.1E: extracted so the same columns render identically whether a
 * row is in the always-visible "Needs your attention" group or tucked
 * inside a collapsed <details> below it — same data, same table, just a
 * different amount of visibility per group. */
function ContentTable({ rows, orgSlug, canApprove }: { rows: ContentRow[]; orgSlug: string; canApprove: boolean }) {
  return (
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
              <td className="dash-muted" data-label="Target keyword">
                {b.primary_keyword ?? "-"}
              </td>
              <td data-label="Status">
                <span className={`dash-badge ${job ? (STATUS_TONE[job.status] ?? "info") : "info"}`}>{job ? contentStatusLabel(job.status) : "Not started"}</span>
              </td>
              <td data-label="QA">{qa ? <span className={`dash-badge ${qa.passed ? "success" : "danger"}`}>{qa.passed ? "Passed" : "Needs changes"}</span> : <span className="dash-muted">-</span>}</td>
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
  );
}

/**
 * Phase 7.1B: prioritises Title / Target keyword / Status / QA / Approval
 * action per the spec — QA and an inline Approve button reuse the exact
 * same lib/db functions and Server Action the detail page already calls;
 * no new data model, no internal IDs shown.
 *
 * Phase 7.1E: groups the flat list into "Needs your attention"
 * (READY_FOR_APPROVAL/NEEDS_REVIEW, always visible), "In progress", and
 * "Done" — the same wall-of-rows risk 7.1D fixed for Opportunities exists
 * here too once a site has more than a handful of briefs. In-progress/Done
 * use plain <details> (zero JS, same pattern as the sidebar's workspace
 * switcher/account menu) rather than a new client component. Also corrects
 * the old empty-state copy, which claimed briefs are created automatically
 * on accept — they aren't; a person (client or team) has to create one.
 */
export default async function ContentListPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { organization, membership } = await requireOrganizationMembership(orgSlug);
  const website = await getPrimaryWebsiteForOrganization(organization.id);
  const briefs = website ? await listContentBriefsForWebsite(website.id) : [];
  const canApprove = canApproveContent(membership.role);

  const rows: ContentRow[] = await Promise.all(
    briefs.map(async (b) => {
      const jobs = await listContentJobsForBrief(b.id);
      const job = jobs[0] ?? null;
      const latestVersion = await getLatestContentVersionForBrief(b.id);
      const qa = latestVersion ? await getLatestQaResultForVersion(latestVersion.id) : null;
      return { brief: b, job, qa };
    })
  );

  const needsYou = rows.filter((r) => contentAttentionBucket(r.job?.status ?? null) === "needs-you");
  const inProgress = rows.filter((r) => contentAttentionBucket(r.job?.status ?? null) === "in-progress");
  const done = rows.filter((r) => contentAttentionBucket(r.job?.status ?? null) === "done");

  return (
    <>
      <h1 className="dash-page-title">Content</h1>
      <p className="dash-page-subtitle">Pages being written for your site, from brief through approval.</p>

      {briefs.length === 0 && (
        <EmptyState
          title="No content briefs yet"
          description="Briefs turn an accepted opportunity into a page to write — create one from an opportunity's page, or your team can prepare one for you."
        />
      )}

      {briefs.length > 0 && needsYou.length === 0 && <p className="dash-muted" style={{ fontSize: "0.9rem" }}>Nothing needs your attention right now.</p>}

      {needsYou.length > 0 && (
        <section className="dash-section">
          <h2 className="dash-subsection-heading">Needs your attention</h2>
          <ContentTable rows={needsYou} orgSlug={orgSlug} canApprove={canApprove} />
        </section>
      )}

      {inProgress.length > 0 && (
        <details className="dash-section" open={needsYou.length === 0}>
          <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: "0.85rem", color: "var(--dash-text-muted)" }}>In progress ({inProgress.length})</summary>
          <div style={{ marginTop: 10 }}>
            <ContentTable rows={inProgress} orgSlug={orgSlug} canApprove={canApprove} />
          </div>
        </details>
      )}

      {done.length > 0 && (
        <details className="dash-section">
          <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: "0.85rem", color: "var(--dash-text-muted)" }}>Done ({done.length})</summary>
          <div style={{ marginTop: 10 }}>
            <ContentTable rows={done} orgSlug={orgSlug} canApprove={canApprove} />
          </div>
        </details>
      )}
    </>
  );
}
