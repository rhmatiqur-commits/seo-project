import type { OutcomeRecommendation } from "@/lib/supabase/types";

/**
 * Recommendations that imply concrete follow-up work worth tracking as a
 * seo_tasks row. MONITOR ("keep observing a page that's working") and
 * WAIT_FOR_MORE_DATA ("don't conclude anything yet") deliberately never
 * create a task — "avoid changing a successful page unnecessarily" and "do
 * not modify the page [on insufficient data]" (spec section 13).
 */
const TASK_WORTHY_RECOMMENDATIONS: ReadonlySet<OutcomeRecommendation> = new Set(["INVESTIGATE_CTR", "DIAGNOSE_DECLINE"]);

export interface FollowUpTaskDecisionInput {
  recommendation: OutcomeRecommendation;
  autonomyAllowsRecommendations: boolean;
  /** Non-null when this exact outcome row already produced a follow-up task — the duplicate-prevention check (spec section 15). */
  existingFollowUpTaskId: string | null;
}

/**
 * Pure decision: should a follow-up seo_tasks row be created for this
 * outcome right now? Combines the recommendation's own "is this task-worthy"
 * shape, the website's autonomy configuration, and "not already done" into
 * one tested function — mirrors
 * lib/search-performance/scoring.ts's shouldPromoteSearchPerformanceOpportunity
 * shape exactly (same three-part guard: allowed, worth doing, not a duplicate).
 */
export function shouldCreateFollowUpTask(input: FollowUpTaskDecisionInput): boolean {
  if (input.existingFollowUpTaskId !== null) return false;
  if (!input.autonomyAllowsRecommendations) return false;
  return TASK_WORTHY_RECOMMENDATIONS.has(input.recommendation);
}
