import { getSeoActionForContentPublication, getSeoActionForTask, insertSeoAction } from "@/lib/db/seo-actions";
import { getSearchPerformanceOpportunityBySeoOpportunityId } from "@/lib/db/search-performance";
import { getOpportunity } from "@/lib/db/opportunities";
import { getTask, updateTaskStatus } from "@/lib/db/tasks";
import { getPageById } from "@/lib/db/pages";
import { listKeywordIdsForOpportunity, getKeyword } from "@/lib/db/keywords";
import { isContentEligibleOpportunityType } from "@/lib/content/eligibility";
import { deriveActionType } from "@/lib/outcomes/action-type";
import type { PublishingContext } from "@/lib/jobs/handlers/publishing-shared";
import type { OpportunityType } from "@/lib/supabase/types";

/**
 * Phase 7.2A: closes the "task never reflects the page it was created for
 * actually going live" gap identified in the P0-2 investigation. Called only
 * from recordSeoActionForPublication below — i.e. only after
 * updatePublicationStatus(..., "PUBLISHED", ...) has already committed in
 * the caller (lib/jobs/handlers/publish-content.ts or
 * merge-to-production.ts) — never from preparation, preview, PR creation, or
 * approval. Idempotent and non-destructive: a null taskId is a no-op (not
 * every content_briefs row has one), and a task already in a terminal state
 * (completed, or cancelled by a human) is left exactly as it is rather than
 * being overwritten.
 */
async function completeTaskIfLinked(taskId: string | null): Promise<void> {
  if (!taskId) return;
  const task = await getTask(taskId);
  if (!task) return;
  if (task.status === "completed" || task.status === "cancelled") return;
  await updateTaskStatus(taskId, "completed");
}

/**
 * Phase 6 hook: called from lib/jobs/handlers/publish-content.ts right after
 * a content_publications row reaches PUBLISHED. Creates the seo_actions row
 * that makes this publication measurable by ANALYSE_ACTION_OUTCOMES —
 * "record publication/action date" (README's Phase 5 "what remains" list).
 * Idempotent: a content_publication has at most one seo_action (checked here
 * and DB-enforced by a partial unique index, migration 0021), so calling
 * this again on a re-publish/retry is a safe no-op.
 */
export async function recordSeoActionForPublication(ctx: PublishingContext, publishedUrl: string): Promise<void> {
  const existing = await getSeoActionForContentPublication(ctx.publication.id);
  if (existing) {
    // Phase 7.2A: a re-publish/retry that hits this early return already
    // recorded the action on an earlier attempt — but if that earlier
    // attempt's task-completion step didn't run (e.g. it predates this
    // change, or itself failed), this still closes the loop now.
    await completeTaskIfLinked(ctx.brief.seo_task_id).catch((error) => {
      console.warn(`[jobs] failed to auto-complete task for content_brief ${ctx.brief.id}, continuing:`, error);
    });
    return;
  }

  // When this opportunity was promoted from the Phase 2D/3 detector
  // pipeline, its detector_type is a more specific action-type signal than
  // the opportunity's own generic CREATE_NEW_PAGE/OPTIMISE_EXISTING_PAGE
  // (see lib/outcomes/action-type.ts's deriveActionType) — traces a
  // COMPETITOR_CONTENT_GAP-originated page as exactly that, not just
  // "a new page".
  const detectorRow = ctx.brief.seo_opportunity_id ? await getSearchPerformanceOpportunityBySeoOpportunityId(ctx.brief.seo_opportunity_id) : null;
  const actionType = deriveActionType(ctx.brief.content_type as OpportunityType, detectorRow?.detector_type ?? null);
  if (!actionType) {
    // content_briefs.content_type is constrained to CREATE_NEW_PAGE/
    // OPTIMISE_EXISTING_PAGE at insert time (lib/content/eligibility.ts), so
    // this should be unreachable — but never silently invent an action_type.
    console.warn(`[jobs] could not derive a seo_action_type for content_brief ${ctx.brief.id} (content_type=${ctx.brief.content_type}); skipping seo_action creation`);
    return;
  }

  await insertSeoAction({
    organizationId: ctx.publication.organization_id,
    websiteId: ctx.publication.website_id,
    seoOpportunityId: ctx.brief.seo_opportunity_id,
    seoTaskId: ctx.brief.seo_task_id,
    contentBriefId: ctx.brief.id,
    contentVersionId: ctx.version.id,
    contentPublicationId: ctx.publication.id,
    actionType,
    targetUrl: publishedUrl,
    targetKeywordId: ctx.brief.primary_keyword_id,
    targetKeywordText: ctx.brief.primary_keyword,
  });

  // Phase 7.2A: the moment this publication is confirmed recorded as a real
  // seo_action, also close out the seo_tasks row it came from — the same
  // hook point as above, so both publish-content.ts and
  // merge-to-production.ts (the only two callers of this function) get this
  // for free without either file changing.
  await completeTaskIfLinked(ctx.brief.seo_task_id).catch((error) => {
    console.warn(`[jobs] failed to auto-complete task for content_brief ${ctx.brief.id}, continuing:`, error);
  });
}

/**
 * Phase 6 hook: called from app/admin/actions.ts's updateTaskStatusAction
 * when a task is marked 'completed'. Covers the "do not assume every action
 * produces a published page" cases (spec section 2) — TECHNICAL_FIX,
 * IMPROVE_INTERNAL_LINKING, IMPROVE_CTR, and detector-sourced actions that
 * never went through the content pipeline. Deliberately a no-op for
 * content-eligible opportunities (CREATE_NEW_PAGE/OPTIMISE_EXISTING_PAGE) —
 * those are recorded by recordSeoActionForPublication above, at the moment
 * of actual publication, with a real published URL; marking the *task*
 * complete is not the same event and would record a target_url that may not
 * exist yet (or ever, if publication is later abandoned).
 */
export async function recordSeoActionForCompletedTask(taskId: string): Promise<void> {
  const task = await getTask(taskId);
  if (!task || !task.opportunity_id) return;

  const opportunity = await getOpportunity(task.opportunity_id);
  if (!opportunity) return;
  if (isContentEligibleOpportunityType(opportunity.type)) return;

  const existing = await getSeoActionForTask(taskId);
  if (existing) return;

  const detectorRow = await getSearchPerformanceOpportunityBySeoOpportunityId(opportunity.id);
  const actionType = deriveActionType(opportunity.type, detectorRow?.detector_type ?? null);
  if (!actionType) return; // RESEARCH_REQUIRED/INVESTIGATE_* -- not an executable action, nothing to trace.

  const targetPage = opportunity.target_page_id ? await getPageById(opportunity.target_page_id) : null;
  const keywordIds = await listKeywordIdsForOpportunity(opportunity.id);
  const primaryKeyword = keywordIds[0] ? await getKeyword(keywordIds[0]) : null;

  await insertSeoAction({
    organizationId: opportunity.organization_id,
    websiteId: opportunity.website_id,
    seoOpportunityId: opportunity.id,
    seoTaskId: task.id,
    actionType,
    targetUrl: targetPage?.url ?? null,
    targetKeywordId: primaryKeyword?.id ?? null,
    targetKeywordText: primaryKeyword?.keyword ?? null,
  });
}
