import type { OpportunityType, SearchPerformanceDetectorType, SeoActionType } from "@/lib/supabase/types";

/**
 * A subset of search_performance_detector_type values that map directly onto
 * a seo_action_type of the same name (the spec's 8-value action-type list
 * deliberately mixes detector-type and opportunity-type vocabulary — see
 * migration 0021's comment on seo_action_type). These take priority over the
 * opportunity's own `type` when a detector context is known, since the
 * detector is more specific about *why* the action happened (e.g. a
 * CREATE_NEW_PAGE opportunity promoted from a COMPETITOR_CONTENT_GAP
 * detector should be traced as COMPETITOR_CONTENT_GAP, not the more generic
 * CREATE_NEW_PAGE).
 */
const DETECTOR_TYPE_ACTION_TYPES: ReadonlySet<SearchPerformanceDetectorType> = new Set(["CONTENT_GAP", "COMPETITOR_CONTENT_GAP", "COMPETITOR_RANKING_GAP"]);

/**
 * Maps an opportunity_type onto the equivalent seo_action_type. Opportunity
 * types that are investigative recommendations rather than executable
 * actions (RESEARCH_REQUIRED, INVESTIGATE_DECLINE, INVESTIGATE_OPPORTUNITY)
 * are deliberately absent — a seo_actions row is never created for those.
 */
const OPPORTUNITY_TYPE_TO_ACTION_TYPE: Partial<Record<OpportunityType, SeoActionType>> = {
  CREATE_NEW_PAGE: "CREATE_NEW_PAGE",
  OPTIMISE_EXISTING_PAGE: "OPTIMISE_EXISTING_PAGE",
  IMPROVE_CTR: "IMPROVE_CTR",
  IMPROVE_INTERNAL_LINKING: "IMPROVE_INTERNAL_LINKING",
  INTERNAL_LINKING: "IMPROVE_INTERNAL_LINKING",
  TECHNICAL_FIX: "TECHNICAL_FIX",
};

/**
 * Pure derivation of a seo_actions.action_type from the opportunity/detector
 * context that produced it. Returns null when the opportunity type isn't
 * something Phase 6 tracks as an executable action — callers (see
 * app/admin/actions.ts's updateTaskStatusAction and
 * lib/jobs/handlers/publish-content.ts) must not create a seo_actions row in
 * that case, rather than guessing.
 */
export function deriveActionType(opportunityType: OpportunityType, detectorType: SearchPerformanceDetectorType | null): SeoActionType | null {
  if (detectorType && DETECTOR_TYPE_ACTION_TYPES.has(detectorType)) {
    return detectorType as SeoActionType;
  }
  return OPPORTUNITY_TYPE_TO_ACTION_TYPE[opportunityType] ?? null;
}

/**
 * Phase 7.2A: "can this opportunity/task type ever become measurable at
 * all" — a plain lookup on the same map deriveActionType already uses (no
 * second list to keep in sync). True for the 6 types that produce a real
 * seo_actions row somewhere in this codebase (2 content-eligible + 4
 * non-content); false for the 3 investigative types (RESEARCH_REQUIRED,
 * INVESTIGATE_DECLINE, INVESTIGATE_OPPORTUNITY), which never do, by design.
 * Deliberately ignores detector_type — that only ever narrows *which*
 * measurable action_type gets recorded, never turns an unmeasurable
 * opportunity type into a measurable one.
 */
export function isMeasurableOpportunityType(opportunityType: OpportunityType): boolean {
  return OPPORTUNITY_TYPE_TO_ACTION_TYPE[opportunityType] !== undefined;
}
