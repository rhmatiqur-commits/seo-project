import { requireOrganizationMembership } from "@/lib/auth/session";
import { getPrimaryWebsiteForOrganization } from "@/lib/dashboard/website";
import { listIssuesForWebsite } from "@/lib/db/audits";
import { EmptyState } from "@/app/dashboard/_components/EmptyState";

export const dynamic = "force-dynamic";

const SEVERITY_ORDER = ["critical", "high", "medium", "low"] as const;
const SEVERITY_TONE: Record<string, string> = { critical: "danger", high: "danger", medium: "warning", low: "info" };

export default async function AuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ severity?: string }>;
}) {
  const { orgSlug } = await params;
  const { severity } = await searchParams;
  const { organization } = await requireOrganizationMembership(orgSlug);
  const website = await getPrimaryWebsiteForOrganization(organization.id);
  const allIssues = website ? await listIssuesForWebsite(website.id) : [];
  const openIssues = allIssues.filter((i) => i.status === "open");
  const issues = severity ? openIssues.filter((i) => i.severity === severity) : openIssues;

  const bySeverity = SEVERITY_ORDER.map((sev) => ({ severity: sev, count: openIssues.filter((i) => i.severity === sev).length }));

  return (
    <>
      <h1 className="dash-page-title">SEO Audit</h1>
      <p className="dash-page-subtitle">Technical issues that could be holding your pages back in search.</p>

      <div className="dash-grid dash-grid-cols-4" style={{ marginBottom: 24 }}>
        {bySeverity.map(({ severity: sev, count }) => (
          <a key={sev} href={`?severity=${sev}`} className={`dash-card stat interactive${severity === sev ? " selected" : ""}`}>
            <div className="dash-stat-label">{sev}</div>
            <div className="dash-stat-value">{count}</div>
          </a>
        ))}
      </div>
      {severity && (
        <p>
          <a href="?">Clear filter &times;</a>
        </p>
      )}

      {issues.length === 0 && (
        <EmptyState
          title="No open issues at this severity"
          description="Nicely done — nothing here needs attention right now. New issues surface automatically after your next SEO audit."
        />
      )}

      {issues.length > 0 && (
        <div className="dash-table-wrap">
          <table className="dash-table">
            <thead>
              <tr>
                <th>Severity</th>
                <th>Issue</th>
                <th>Recommended action</th>
              </tr>
            </thead>
            <tbody>
              {issues.map((issue) => (
                <tr key={issue.id}>
                  <td>
                    <span className={`dash-badge ${SEVERITY_TONE[issue.severity]}`}>{issue.severity}</span>
                  </td>
                  <td>{issue.description}</td>
                  <td className="dash-muted">{issue.recommended_action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
