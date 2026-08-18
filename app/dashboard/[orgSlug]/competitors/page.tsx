import { requireOrganizationMembership } from "@/lib/auth/session";
import { getPrimaryWebsiteForOrganization } from "@/lib/dashboard/website";
import { listCompetitorDomainsForWebsite } from "@/lib/db/competitors";
import { listSearchPerformanceOpportunitiesForWebsite } from "@/lib/db/search-performance";

export const dynamic = "force-dynamic";

const CLASSIFICATION_LABEL: Record<string, string> = {
  DIRECT_COMPETITOR: "Direct competitor",
  DIRECTORY: "Directory",
  MARKETPLACE: "Marketplace",
  INFORMATIONAL: "Informational site",
  OTHER: "Other",
  UNKNOWN: "Unclassified",
};

export default async function CompetitorsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { organization } = await requireOrganizationMembership(orgSlug);
  const website = await getPrimaryWebsiteForOrganization(organization.id);
  const [domains, allOpportunities] = website
    ? await Promise.all([listCompetitorDomainsForWebsite(website.id), listSearchPerformanceOpportunitiesForWebsite(website.id)])
    : [[], []];
  const gapOpportunities = allOpportunities.filter((o) => o.detector_type === "COMPETITOR_CONTENT_GAP" || o.detector_type === "COMPETITOR_RANKING_GAP");
  const directCompetitors = domains.filter((d) => d.classification === "DIRECT_COMPETITOR").sort((a, b) => (b.relevance_score ?? 0) - (a.relevance_score ?? 0));

  return (
    <>
      <h1 className="dash-page-title">Competitors</h1>
      <p className="dash-page-subtitle">Who else ranks for the keywords that matter to you.</p>

      {directCompetitors.length === 0 && <p className="dash-empty">No competitor data yet.</p>}

      <table className="dash-table" style={{ marginBottom: 28 }}>
        <thead>
          <tr>
            <th>Domain</th>
            <th>Type</th>
            <th>Appears for</th>
            <th>Average position</th>
          </tr>
        </thead>
        <tbody>
          {directCompetitors.map((d) => (
            <tr key={d.id}>
              <td style={{ fontWeight: 600 }}>{d.domain}</td>
              <td className="dash-muted">{CLASSIFICATION_LABEL[d.classification]}</td>
              <td className="dash-muted">{d.relevant_keyword_count} keyword{d.relevant_keyword_count === 1 ? "" : "s"}</td>
              <td className="dash-muted">{d.average_position !== null ? Math.round(d.average_position * 10) / 10 : "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {gapOpportunities.length > 0 && (
        <>
          <h2 style={{ fontSize: "1rem" }}>Where competitors are ahead</h2>
          <div className="dash-grid">
            {gapOpportunities.map((o) => (
              <div key={o.id} className="dash-card">
                <span className="dash-badge warning">{o.detector_type === "COMPETITOR_CONTENT_GAP" ? "Content gap" : "Ranking gap"}</span>
                <p style={{ fontSize: "0.86rem", margin: "8px 0 0" }}>{o.reasoning}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
