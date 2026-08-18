import Link from "next/link";
import { requireOrganizationMembership } from "@/lib/auth/session";
import { getPrimaryWebsiteForOrganization } from "@/lib/dashboard/website";
import { listContentBriefsForWebsite, listContentJobsForBrief } from "@/lib/db/content";
import { EmptyState } from "@/app/dashboard/_components/EmptyState";

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

export default async function ContentListPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { organization } = await requireOrganizationMembership(orgSlug);
  const website = await getPrimaryWebsiteForOrganization(organization.id);
  const briefs = website ? await listContentBriefsForWebsite(website.id) : [];
  const latestJobByBrief = new Map(
    await Promise.all(
      briefs.map(async (b) => {
        const jobs = await listContentJobsForBrief(b.id);
        return [b.id, jobs[0] ?? null] as const;
      })
    )
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
                <th>Type</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {briefs.map((b) => {
                const job = latestJobByBrief.get(b.id);
                return (
                  <tr key={b.id}>
                    <td data-label="Page">
                      <Link href={`/dashboard/${orgSlug}/content/${b.id}`}>{b.target_url ?? b.primary_keyword ?? "Untitled brief"}</Link>
                    </td>
                    <td className="dash-muted" data-label="Target keyword">{b.primary_keyword ?? "-"}</td>
                    <td className="dash-muted" data-label="Type">{b.content_type === "CREATE_NEW_PAGE" ? "New page" : "Page update"}</td>
                    <td data-label="Status">
                      <span className={`dash-badge ${job ? STATUS_TONE[job.status] ?? "info" : "info"}`}>{job ? job.status.replace(/_/g, " ") : "Not started"}</span>
                    </td>
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
