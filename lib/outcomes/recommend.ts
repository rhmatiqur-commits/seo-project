import type { OutcomeClassification, OutcomeRecommendation } from "@/lib/supabase/types";

export interface RecommendationInput {
  classification: OutcomeClassification;
  ctrChangePoints: number;
  clicksChangePct: number | null;
}

export interface RecommendationResult {
  recommendation: OutcomeRecommendation;
  reasoning: string;
}

/**
 * The Next Action Engine (spec section 13) — a deterministic mapping from a
 * classification (plus, for MIXED, which metrics moved which way) to a
 * recommendation. Never proposes changing a page that's already succeeding
 * ("avoid changing a successful page unnecessarily"), never concludes
 * anything from insufficient/inconclusive data ("do not modify the page").
 * The recommendation only ever drives a *task* (human-reviewed), never an
 * automatic content change — see lib/outcomes/follow-up.ts and
 * lib/outcomes/autonomy.ts.
 */
export function recommendNextAction(input: RecommendationInput): RecommendationResult {
  switch (input.classification) {
    case "POSITIVE":
      return {
        recommendation: "MONITOR",
        reasoning: "Performance improved — keep observing rather than making further changes to a page that appears to be working.",
      };
    case "NEGATIVE":
      return {
        recommendation: "DIAGNOSE_DECLINE",
        reasoning:
          "Performance declined — investigate before deciding what (if anything) to change. A decline can have many causes beyond this specific action (competitor movement, SERP changes, seasonality, technical issues).",
      };
    case "MIXED":
      if (input.clicksChangePct !== null && input.clicksChangePct > 0 && input.ctrChangePoints < 0) {
        return {
          recommendation: "INVESTIGATE_CTR",
          reasoning: "Clicks increased but click-through rate fell — worth checking whether the page's title/snippet is under-converting relative to its new visibility.",
        };
      }
      return {
        recommendation: "DIAGNOSE_DECLINE",
        reasoning: "Some metrics improved and others declined — review each individually before concluding this action succeeded or failed.",
      };
    case "INCONCLUSIVE":
    case "INSUFFICIENT_DATA":
    default:
      return {
        recommendation: "WAIT_FOR_MORE_DATA",
        reasoning: "Not enough evidence yet to draw a conclusion — do not modify the page based on this measurement; re-check at a later measurement window.",
      };
  }
}
