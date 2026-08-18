import { requireOrganizationMembership } from "@/lib/auth/session";
import { getPrimaryWebsiteForOrganization } from "@/lib/dashboard/website";
import { listOpportunitiesForWebsite } from "@/lib/db/opportunities";
import { canManageSeoWork } from "@/lib/auth/permissions";
import { acceptOpportunityAction, dismissOpportunityAction } from "@/app/dashboard/actions";

export const dynamic = "force-dynamic";

const TYPE_LABELS: Record<string, string> = {
  CREATE_NEW_PAGE: "Create a new page",
  OPTIMISE_EXISTING_PAGE: "Improve an existing page",
  TECHNICAL_FIX: "Technical fix",
  INTERNAL_LINKING: "Internal linking",
  RESEARCH_REQUIRED: "Needs research",
  IMPROVE_CTR: "Improve click-through rate",
  INVESTIGATE_DECLINE: "Investigate a decline",
  INVESTIGATE_OPPORTUNITY: "Investigate an opportunity",
  IMPROVE_INTERNAL_LINKING: "Improve internal linking",
};

/** Translates the internal 0-20-ish priority_score into a client-friendly
 * Low/Medium/High impact label — never shows the raw internal number or its
 * formula (spec: "Do not expose internal scoring implementation unnecessarily"). */
function impactLabel(score: number): { label: string; tone: string } {
  if (score >= 10) return { label: "High impact", tone: "danger" };
  if (score >= 5) return { label: "Medium impact", tone: "warning" };
  return { label: "Low impact", tone: "info" };
}

export default async function OpportunitiesPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { organization, membership } = await requireOrganizationMembership(orgSlug);
  const website = await getPrimaryWebsiteForOrganization(organization.id);
  const opportunities = website ? await listOpportunitiesForWebsite(website.id) : [];
  const canAct = canManageSeoWork(membership.role);

  const open = opportunities.filter((o) => o.status === "new");
  const decided = opportunities.filter((o) => o.status !== "new");

  return (
    <>
      <h1 className="dash-page-title">Opportunities</h1>
      <p className="dash-page-subtitle">Recommendations for growing your organic search performance.</p>

      {open.length === 0 && <p className="dash-empty">No new opportunities right now — check back after your next SEO analysis.</p>}

      <div className="dash-grid" style={{ marginBottom: 28 }}>
        {open.map((o) => {
          const impact = impactLabel(o.priority_score);
          return (
            <div key={o.id} className="dash-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                <div>
                  <span className={`dash-badge ${impact.tone}`}>{impact.label}</span>{" "}
                  <span className="dash-badge">{TYPE_LABELS[o.type] ?? o.type}</span>
                  <h3 style={{ margin: "8px 0 4px" }}>{o.title}</h3>
                </div>
              </div>
              <p className="dash-muted" style={{ fontSize: "0.88rem" }}>
                {o.description}
              </p>
              <p style={{ fontSize: "0.85rem" }}>
                <strong>Why this matters:</strong> {o.rationale}
              </p>
              {canAct && (
                <div className="dash-row" style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <form action={acceptOpportunityAction}>
                    <input type="hidden" name="org_slug" value={orgSlug} />
                    <input type="hidden" name="opportunity_id" value={o.id} />
                    <button className="dash-btn" type="submit">
                      Accept &amp; create task
                    </button>
                  </form>
                  <form action={dismissOpportunityAction}>
                    <input type="hidden" name="org_slug" value={orgSlug} />
                    <input type="hidden" name="opportunity_id" value={o.id} />
                    <button className="dash-btn secondary" type="submit">
                      Dismiss
                    </button>
                  </form>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {decided.length > 0 && (
        <>
          <h2 style={{ fontSize: "1rem" }}>Previously reviewed</h2>
          <table className="dash-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Type</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {decided.map((o) => (
                <tr key={o.id}>
                  <td>{o.title}</td>
                  <td className="dash-muted">{TYPE_LABELS[o.type] ?? o.type}</td>
                  <td>
                    <span className={`dash-badge ${o.status === "approved" || o.status === "done" ? "success" : "danger"}`}>{o.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}
