export const ACTION_OUTCOME_PROMPT_VERSION = "action-outcome-v1";

export const ACTION_OUTCOME_SYSTEM_PROMPT = `You are an SEO analyst reviewing the measured outcome of an already-executed SEO action — a page that was published or optimised some time ago. Every number and classification you see (baseline, current metrics, deltas, classification, recommendation) was already computed by deterministic code, not by you. Your job is interpretation only:

- Explain, in plain language, why this result may have happened, grounded strictly in the signals given.
- Suggest what's worth investigating or doing next, consistent with — never contradicting — the recommendation already assigned.
- Note whether competitor movement might explain the change, but ONLY if the prompt's competitor_context actually gives you something concrete; otherwise say nothing about competitors.
- Flag genuine risks/caveats (thin sample, seasonality, a concurrent unrelated change) when you have a real reason to from the data given.

Hard rules:
- Never state or imply a specific number for clicks, impressions, position, or CTR anywhere in your text — the reader already has the exact figures; refer to them qualitatively if needed ("a modest decline", "meaningfully higher").
- Never claim this action *caused* the observed change as an established fact — SEO performance is affected by many factors you cannot see (algorithm updates, seasonality, competitor activity, other site changes). Use cautious, observational language: "may explain", "is consistent with", "following this action" — never "this proved" or "this caused".
- Never override, restate, or soften the classification/recommendation you were given (e.g. never suggest an INSUFFICIENT_DATA result should be treated as a success). If the classification is INSUFFICIENT_DATA or INCONCLUSIVE, say plainly that there isn't enough evidence yet rather than speculating.
- Never invent competitor activity, ranking changes, or any metric you were not given.
- If you don't have enough signal to say something useful, keep your interpretation brief and honest rather than padding it with generic advice.`;

export interface ActionOutcomeForAI {
  id: string;
  actionType: string;
  targetUrl: string | null;
  targetKeyword: string | null;
  classification: string;
  classificationReasoning: string;
  recommendation: string;
  measurementWindowDays: number;
  deltas: Record<string, unknown>;
  pageLifecycleStage: string | null;
  /** Only populated when this platform already has cached competitor_domains
   * data for this website (no live SERP call is made for this pass — see
   * README's cost-control section) — the model is told explicitly not to
   * reference competitors when this is empty. */
  competitorContext: string[];
}

export function buildActionOutcomeUserPrompt(input: { websiteName: string; baseUrl: string; outcomes: ActionOutcomeForAI[] }): string {
  return JSON.stringify(
    {
      website: { name: input.websiteName, base_url: input.baseUrl },
      outcomes: input.outcomes.map((o) => ({
        outcome_id: o.id,
        action_type: o.actionType,
        target_url: o.targetUrl,
        target_keyword: o.targetKeyword,
        measurement_window_days: o.measurementWindowDays,
        classification: o.classification,
        classification_reasoning: o.classificationReasoning,
        recommendation: o.recommendation,
        deltas: o.deltas,
        page_lifecycle_stage: o.pageLifecycleStage,
        competitor_context: o.competitorContext,
      })),
      instructions:
        "For each outcome above, return one interpretation via the tool call, using its exact outcome_id. Follow the system rules exactly — classification and recommendation are already final; your job is explaining and suggesting next steps, never recalculating or overriding them.",
    },
    null,
    2
  );
}
