import { ALERT_TRAFFIC_DECLINE_CLICKS_PCT, ALERT_RANKING_DECLINE_POSITIONS, ALERT_SUCCESSFUL_IMPROVEMENT_CLICKS_PCT, ALERT_NEW_PAGE_TRACTION_IMPRESSIONS } from "@/lib/outcomes/limits";
import type { OutcomeDeltas } from "@/lib/outcomes/types";
import type { OutcomeClassification, SeoAlertSeverity, SeoAlertType } from "@/lib/supabase/types";

export interface AlertEvalInput {
  classification: OutcomeClassification;
  deltas: OutcomeDeltas;
  isNewPage: boolean;
  currentImpressions: number;
}

export interface AlertCandidate {
  alertType: SeoAlertType;
  severity: SeoAlertSeverity;
  message: string;
}

/**
 * Pure alert-threshold evaluation (spec section 18) — only returns a
 * candidate when a configurable threshold is actually exceeded, so
 * ordinary/small movements never generate an alert ("do not spam users").
 * Deduplication against an already-open alert for the same outcome row
 * happens at the DB layer (a unique index on
 * (seo_action_outcome_id, alert_type) — see lib/db/seo-alerts.ts), so this
 * function can be called every run without checking history itself.
 *
 * NEW_HIGH_VALUE_KEYWORD is a valid seo_alert_type but is intentionally not
 * evaluated here — it belongs to newly-emerging-keyword detection (Phase
 * 2D's EMERGING_KEYWORD detector), a different signal than an executed
 * action's outcome. Wiring it up is flagged as a follow-up in the README
 * rather than approximated with a shaky heuristic here.
 */
export function evaluateAlertCandidates(input: AlertEvalInput): AlertCandidate[] {
  const candidates: AlertCandidate[] = [];

  if (input.deltas.positionChange !== null && input.deltas.positionChange <= -ALERT_RANKING_DECLINE_POSITIONS) {
    candidates.push({
      alertType: "RANKING_DECLINE",
      severity: "critical",
      message: `Average position worsened by ${Math.abs(input.deltas.positionChange).toFixed(1)} places following this action.`,
    });
  }

  if (input.deltas.clicksChangePct !== null && input.deltas.clicksChangePct <= -ALERT_TRAFFIC_DECLINE_CLICKS_PCT) {
    candidates.push({
      alertType: "TRAFFIC_DECLINE",
      severity: "warning",
      message: `Clicks fell ${Math.abs(input.deltas.clicksChangePct)}% versus the pre-action baseline.`,
    });
  }

  if (input.classification === "POSITIVE" && input.deltas.clicksChangePct !== null && input.deltas.clicksChangePct >= ALERT_SUCCESSFUL_IMPROVEMENT_CLICKS_PCT) {
    candidates.push({
      alertType: "SUCCESSFUL_IMPROVEMENT",
      severity: "info",
      message: `Clicks grew ${input.deltas.clicksChangePct}% following this action.`,
    });
  }

  if (input.isNewPage && input.currentImpressions >= ALERT_NEW_PAGE_TRACTION_IMPRESSIONS) {
    candidates.push({
      alertType: "NEW_PAGE_TRACTION",
      severity: "info",
      message: `New page has reached ${input.currentImpressions} impressions in this measurement window.`,
    });
  }

  return candidates;
}
