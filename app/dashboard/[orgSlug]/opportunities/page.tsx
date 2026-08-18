import { requireOrganizationMembership } from "@/lib/auth/session";
import { getPrimaryWebsiteForOrganization } from "@/lib/dashboard/website";
import { listOpportunitiesForWebsite } from "@/lib/db/opportunities";
import { getPageById } from "@/lib/db/pages";
import { canManageSeoWork } from "@/lib/auth/permissions";
import { acceptOpportunityAction, dismissOpportunityAction } from "@/app/dashboard/actions";
import { EmptyState } from "@/app/dashboard/_components/EmptyState";
import { OpportunityBrowser } from "@/app/dashboard/_components/OpportunityBrowser";
import { buildOpportunityCardViewModel } from "@/lib/dashboard/opportunity-detail";
import { selectOpportunitiesViewState } from "@/lib/dashboard/opportunity-groups";

export const dynamic = "force-dynamic";

/**
 * Phase 7.1D: replaces the old unbounded "every 'new' opportunity as a
 * card, everything else in a flat table" layout with a bounded, filterable,
 * grouped-by-impact view — see OpportunityBrowser. This page's only job is
 * data: fetch the same opportunities the old page fetched (no new query
 * shape), resolve each one's affected page via the existing getPageById
 * lookup, and hand plain view models to the client component that does the
 * filtering/grouping/show-more.
 */
export default async function OpportunitiesPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { organization, membership } = await requireOrganizationMembership(orgSlug);
  const website = await getPrimaryWebsiteForOrganization(organization.id);

  if (!website) {
    return (
      <>
        <h1 className="dash-page-title">Opportunities</h1>
        <EmptyState title="No website configured yet" description="Opportunities appear once a website has been set up for your organisation." />
      </>
    );
  }

  const opportunities = await listOpportunitiesForWebsite(website.id);
  const canAct = canManageSeoWork(membership.role);

  const uniquePageIds = Array.from(new Set(opportunities.map((o) => o.target_page_id).filter((id): id is string => id !== null)));
  const pages = await Promise.all(uniquePageIds.map((id) => getPageById(id)));
  const pageById = new Map(uniquePageIds.map((id, i) => [id, pages[i]]));

  const cards = opportunities.map((o) => buildOpportunityCardViewModel(o, o.target_page_id ? (pageById.get(o.target_page_id) ?? null) : null));
  const viewState = selectOpportunitiesViewState(opportunities);
  const totalNewCount = opportunities.filter((o) => o.status === "new").length;

  return (
    <>
      <h1 className="dash-page-title">Opportunities</h1>

      <OpportunityBrowser
        cards={cards}
        totalNewCount={totalNewCount}
        viewState={viewState}
        orgSlug={orgSlug}
        canAct={canAct}
        acceptAction={acceptOpportunityAction}
        dismissAction={dismissOpportunityAction}
      />
    </>
  );
}
