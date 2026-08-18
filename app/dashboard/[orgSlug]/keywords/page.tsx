import { requireOrganizationMembership } from "@/lib/auth/session";
import { getPrimaryWebsiteForOrganization } from "@/lib/dashboard/website";
import { listKeywordsForWebsite, listKeywordOpportunitiesForWebsite } from "@/lib/db/keywords";

export const dynamic = "force-dynamic";

const INTENT_LABELS: Record<string, string> = {
  INFORMATIONAL: "Informational",
  COMMERCIAL: "Commercial",
  TRANSACTIONAL: "Ready to buy",
  NAVIGATIONAL: "Navigational",
  LOCAL: "Local",
  UNKNOWN: "Unclassified",
};

export default async function KeywordsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { organization } = await requireOrganizationMembership(orgSlug);
  const website = await getPrimaryWebsiteForOrganization(organization.id);
  const [keywords, opportunities] = website
    ? await Promise.all([listKeywordsForWebsite(website.id), listKeywordOpportunitiesForWebsite(website.id)])
    : [[], []];
  const opportunityByKeywordId = new Map(opportunities.map((o) => [o.keyword_id, o]));

  return (
    <>
      <h1 className="dash-page-title">Keywords</h1>
      <p className="dash-page-subtitle">Search terms we&apos;re tracking for your site.</p>

      {keywords.length === 0 && <p className="dash-empty">No keywords tracked yet — they appear after your next keyword discovery run.</p>}

      <table className="dash-table">
        <thead>
          <tr>
            <th>Keyword</th>
            <th>Intent</th>
            <th>Source</th>
            <th>Best-matching page</th>
          </tr>
        </thead>
        <tbody>
          {keywords.map((k) => {
            const opp = opportunityByKeywordId.get(k.id);
            return (
              <tr key={k.id}>
                <td style={{ fontWeight: 600 }}>{k.keyword}</td>
                <td className="dash-muted">{INTENT_LABELS[k.search_intent] ?? k.search_intent}</td>
                <td className="dash-muted">{k.source === "ai_suggested" ? "AI recommendation" : k.source === "provider" ? "Provider data" : "Manual entry"}</td>
                <td className="dash-muted">{opp?.recommended_action ?? "-"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}
