import { notFound } from "next/navigation";
import { requireOrganizationMembership } from "@/lib/auth/session";
import { assertOwnedByOrganization } from "@/lib/api/authorize";
import { getOpportunity } from "@/lib/db/opportunities";
import { getSearchPerformanceOpportunityBySeoOpportunityId } from "@/lib/db/search-performance";
import { getPageById } from "@/lib/db/pages";
import { getContentBriefBySeoOpportunityId } from "@/lib/db/content";
import { getTaskForOpportunity, getTask } from "@/lib/db/tasks";
import { getSeoActionForTask } from "@/lib/db/seo-actions";
import { getLatestOutcomeForAction } from "@/lib/db/seo-action-outcomes";
import { canManageSeoWork, canEditContent } from "@/lib/auth/permissions";
import { acceptOpportunityAction, dismissOpportunityAction, createContentBriefDashboardAction } from "@/app/dashboard/actions";
import { OpportunityDetailPanel } from "@/app/dashboard/_components/OpportunityDetailPanel";
import { buildOpportunityDetailViewModel } from "@/lib/dashboard/opportunity-detail";
import { buildOutcomeSummaryViewModel } from "@/lib/dashboard/outcome-summary";

export const dynamic = "force-dynamic";

/**
 * Phase 7.1D: the opportunity detail route — didn't exist before this
 * phase (every opportunity used to only ever render inline as a card or a
 * table row). Fetches the same seo_opportunities row the list page already
 * uses, plus its detector-level row when one exists (richer explanatory
 * data for search-performance-promoted opportunities) and its affected
 * page, then hands everything to a single pure view-model builder so the
 * card and this page always agree on labels.
 */
export default async function OpportunityDetailPage({ params }: { params: Promise<{ orgSlug: string; id: string }> }) {
  const { orgSlug, id } = await params;
  const { organization, membership } = await requireOrganizationMembership(orgSlug);

  const opportunity = await getOpportunity(id);
  assertOwnedByOrganization(opportunity, organization.id, "Opportunity", id);
  if (!opportunity) notFound();

  const [detector, page, contentBrief, task] = await Promise.all([
    getSearchPerformanceOpportunityBySeoOpportunityId(opportunity.id),
    opportunity.target_page_id ? getPageById(opportunity.target_page_id) : Promise.resolve(null),
    getContentBriefBySeoOpportunityId(opportunity.id),
    getTaskForOpportunity(opportunity.id),
  ]);

  const viewModel = buildOpportunityDetailViewModel(opportunity, detector, page);
  const canAct = canManageSeoWork(membership.role);

  // Phase 7.2A: same seo_task_id -> seo_actions -> seo_action_outcomes chain
  // record-seo-action.ts already writes to; this page only ever reads it.
  // Sequential (not Promise.all'd with the fetches above) since each step
  // depends on the previous one's result — a single opportunity detail page
  // load, not a list, so this isn't a meaningful N+1 concern.
  const action = task ? await getSeoActionForTask(task.id) : null;
  const outcome = action ? await getLatestOutcomeForAction(action.id) : null;
  // Phase 7.2B: resolve seo_action_outcomes.follow_up_task_id (a task id) to
  // the opportunity id it belongs to, so the Outcome section can link to it
  // — only ever one extra lookup, only when a follow-up actually exists.
  const followUpTask = outcome?.follow_up_task_id ? await getTask(outcome.follow_up_task_id) : null;
  const outcomeSummary = buildOutcomeSummaryViewModel({
    opportunityType: opportunity.type,
    hasAction: action !== null,
    outcome: outcome
      ? {
          classification: outcome.classification,
          classificationReasoning: outcome.classification_reasoning,
          recommendation: outcome.recommendation,
          measurementWindowDays: outcome.measurement_window_days,
          followUpOpportunityId: followUpTask?.opportunity_id ?? null,
        }
      : null,
  });

  return (
    <OpportunityDetailPanel
      opportunity={viewModel}
      orgSlug={orgSlug}
      canAct={canAct}
      acceptAction={acceptOpportunityAction}
      dismissAction={dismissOpportunityAction}
      contentBriefId={contentBrief?.id ?? null}
      canCreateContent={canEditContent(membership.role)}
      createContentAction={createContentBriefDashboardAction}
      taskStatus={task?.status ?? null}
      outcomeSummary={outcomeSummary}
    />
  );
}
