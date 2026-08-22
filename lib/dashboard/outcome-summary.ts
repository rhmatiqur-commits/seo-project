import type { OpportunityType, OutcomeClassification, OutcomeRecommendation } from "@/lib/supabase/types";
import { isMeasurableOpportunityType } from "@/lib/outcomes/action-type";
import { classificationLabel, classificationTone, recommendationLabel, OUTCOME_MEASURING_LABEL } from "@/lib/dashboard/outcome-labels";

/**
 * Phase 7.2A: the single pure builder behind the "Outcome" section on both
 * the Opportunity detail page and the Tasks page — same four-state model
 * either way, since a seo_tasks.type mirrors its opportunity's type and both
 * surfaces are ultimately asking the same question: "for this opportunity
 * type, given whether a seo_actions row exists yet and what the latest
 * seo_action_outcomes row (if any) says, what should a client see?"
 *
 * No DB access, no new measurement logic — this only re-presents rows the
 * existing lib/outcomes/* pipeline and lib/db/seo-action*.ts already
 * produced. Reuses lib/dashboard/outcome-labels.ts verbatim for every string
 * that already existed on the Outcomes page.
 *
 * State precedence (checked in this exact order — see Phase 7.2A plan):
 *   1. not-measured — the opportunity type is investigative; nothing below
 *      this ever applies, regardless of task/action state.
 *   2. not-yet-live — measurable type, no seo_actions row yet.
 *   3. measuring — a seo_actions row exists, no outcome row yet.
 *   4. classified — the latest seo_action_outcomes row's own labels.
 */
export type OutcomeSummaryState = "not-measured" | "not-yet-live" | "measuring" | "classified";

export interface OutcomeSummaryInput {
  /** The opportunity_type this opportunity/task is (seo_tasks.type mirrors
   * seo_opportunities.type, so either row's `type` column works here). */
  opportunityType: OpportunityType;
  /** True once a seo_actions row exists — the moment this became
   * measurable (content published, or a non-content task marked complete). */
  hasAction: boolean;
  /** The latest seo_action_outcomes row for that action, if one has been
   * computed yet (getLatestOutcomeForAction) — null before the first
   * measurement window elapses, even once hasAction is true. */
  outcome: {
    classification: OutcomeClassification;
    classificationReasoning: string;
    recommendation: OutcomeRecommendation;
    measurementWindowDays: number;
    /** Phase 7.2B: the opportunity id of the follow-up seo_tasks row this
     * outcome's seo_action_outcomes.follow_up_task_id points at, if any —
     * already resolved by the caller (a DB lookup, deliberately kept out of
     * this pure function). Null when no follow-up was ever created. */
    followUpOpportunityId: string | null;
  } | null;
}

export interface OutcomeSummaryViewModel {
  state: OutcomeSummaryState;
  /** Plain-English badge text — always populated regardless of state. */
  label: string;
  /** dash-badge tone class. */
  tone: string;
  /** Non-causal, observed-change reasoning — only for state "classified". */
  reasoning: string | null;
  /** Only for state "classified". */
  recommendationLabel: string | null;
  measurementWindowDays: number | null;
  /** Only for state "classified" — carries input.outcome.followUpOpportunityId
   * through unchanged. Callers render this as "a follow-up opportunity was
   * created following this result", never as a causal claim. */
  followUpOpportunityId: string | null;
}

const NOT_MEASURED_LABEL = "Not tracked automatically";
const NOT_YET_LIVE_LABEL = "Nothing to measure yet";

export function buildOutcomeSummaryViewModel(input: OutcomeSummaryInput): OutcomeSummaryViewModel {
  if (!isMeasurableOpportunityType(input.opportunityType)) {
    return { state: "not-measured", label: NOT_MEASURED_LABEL, tone: "neutral", reasoning: null, recommendationLabel: null, measurementWindowDays: null, followUpOpportunityId: null };
  }

  if (!input.hasAction) {
    return { state: "not-yet-live", label: NOT_YET_LIVE_LABEL, tone: "neutral", reasoning: null, recommendationLabel: null, measurementWindowDays: null, followUpOpportunityId: null };
  }

  if (!input.outcome) {
    return { state: "measuring", label: OUTCOME_MEASURING_LABEL, tone: "info", reasoning: null, recommendationLabel: null, measurementWindowDays: null, followUpOpportunityId: null };
  }

  return {
    state: "classified",
    label: classificationLabel(input.outcome.classification),
    tone: classificationTone(input.outcome.classification),
    reasoning: input.outcome.classificationReasoning,
    recommendationLabel: recommendationLabel(input.outcome.recommendation),
    measurementWindowDays: input.outcome.measurementWindowDays,
    followUpOpportunityId: input.outcome.followUpOpportunityId,
  };
}
