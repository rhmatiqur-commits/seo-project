import type { OutcomeClassification, OutcomeRecommendation } from "@/lib/supabase/types";

/**
 * Phase 7.2A: the exact classification/recommendation copy the client
 * Outcomes page (app/dashboard/[orgSlug]/outcomes/page.tsx) has shown since
 * Phase 7 — moved here verbatim (no wording changed) so the new Opportunity
 * detail and Tasks surfaces this phase adds can show the *same* outcome for
 * the *same* action instead of a second, drifting copy of these strings.
 * Non-causal by construction: every label describes an observed result
 * ("Improved", "Declined"), never a claim that a specific action caused it —
 * see lib/outcomes/classify.ts, which is untouched by this phase.
 */

const CLASSIFICATION_LABEL: Record<OutcomeClassification, string> = {
  POSITIVE: "Improved",
  NEGATIVE: "Declined",
  MIXED: "Mixed result",
  INCONCLUSIVE: "No clear change yet",
  INSUFFICIENT_DATA: "Still gathering data",
};

const CLASSIFICATION_TONE: Record<OutcomeClassification, string> = {
  POSITIVE: "success",
  NEGATIVE: "danger",
  MIXED: "warning",
  INCONCLUSIVE: "info",
  INSUFFICIENT_DATA: "info",
};

const RECOMMENDATION_LABEL: Record<OutcomeRecommendation, string> = {
  MONITOR: "Monitoring — no action needed",
  INVESTIGATE_CTR: "Worth investigating: click-through rate",
  DIAGNOSE_DECLINE: "Needs a closer look",
  WAIT_FOR_MORE_DATA: "Waiting for more data",
};

export function classificationLabel(classification: OutcomeClassification): string {
  return CLASSIFICATION_LABEL[classification] ?? classification;
}

export function classificationTone(classification: OutcomeClassification): string {
  return CLASSIFICATION_TONE[classification] ?? "neutral";
}

export function recommendationLabel(recommendation: OutcomeRecommendation): string {
  return RECOMMENDATION_LABEL[recommendation] ?? recommendation;
}

/** Shown whenever a seo_actions row exists but no seo_action_outcomes row
 * has been computed for it yet (no measurement window has elapsed) — the
 * exact copy the Outcomes page has always used for this case, reused rather
 * than re-worded so an action never appears to say two different things
 * about its own state on two different pages. */
export const OUTCOME_MEASURING_LABEL = "Baseline being established";
