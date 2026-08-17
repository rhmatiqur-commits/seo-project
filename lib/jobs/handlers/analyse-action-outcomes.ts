import { getWebsite } from "@/lib/db/websites";
import { listExecutedSeoActionsForWebsite, captureSeoActionBaseline, getSeoAction } from "@/lib/db/seo-actions";
import { getSearchConsoleStatsForWebsite, listSearchConsoleMetricsForSubjectInRange } from "@/lib/db/search-console";
import { upsertSeoActionOutcome, listOutcomesForAction, markOutcomeFollowUpTaskCreated, listUnanalysedOutcomesForWebsite, recordOutcomeAiInterpretation } from "@/lib/db/seo-action-outcomes";
import { insertAlertIfNotExists } from "@/lib/db/seo-alerts";
import { insertOpportunity } from "@/lib/db/opportunities";
import { insertTask } from "@/lib/db/tasks";
import { createAiJob, completeAiJob } from "@/lib/db/ai-jobs";
import { getAIProvider } from "@/lib/ai/get-provider";
import { actionOutcomeInterpretationSchema, actionOutcomeInterpretationJsonSchema } from "@/lib/ai/schemas";
import { ACTION_OUTCOME_PROMPT_VERSION, ACTION_OUTCOME_SYSTEM_PROMPT, buildActionOutcomeUserPrompt } from "@/lib/ai/prompts/action-outcomes";

import { pickBaselineWindowDays, computeBaselineDateRange, dueMeasurementWindows, computeMeasurementDateRange } from "@/lib/outcomes/windows";
import { aggregateWindowMetrics, EMPTY_WINDOW_METRICS } from "@/lib/outcomes/aggregate";
import { computeOutcomeDeltas } from "@/lib/outcomes/deltas";
import { assessDataSufficiency, classifyOutcome } from "@/lib/outcomes/classify";
import { recommendNextAction, type RecommendationResult } from "@/lib/outcomes/recommend";
import { classifyPageLifecycleStage } from "@/lib/outcomes/lifecycle";
import { evaluateAlertCandidates } from "@/lib/outcomes/alerts";
import { autonomyAllowsRecommendations } from "@/lib/outcomes/autonomy";
import { shouldCreateFollowUpTask } from "@/lib/outcomes/follow-up";
import { MAX_AI_INTERPRETATIONS_PER_RUN } from "@/lib/outcomes/limits";

import type { JobHandler } from "@/lib/jobs/types";
import type { WindowMetrics } from "@/lib/outcomes/types";
import type { Database, OpportunityType, OutcomeRecommendation, PageLifecycleStage } from "@/lib/supabase/types";

const DAY_MS = 24 * 60 * 60 * 1000;

type SeoActionRow = Database["public"]["Tables"]["seo_actions"]["Row"];
type SeoActionOutcomeRow = Database["public"]["Tables"]["seo_action_outcomes"]["Row"];
type WebsiteRow = Database["public"]["Tables"]["websites"]["Row"];

export interface AnalyseActionOutcomesResult {
  actionsConsidered: number;
  baselinesCaptured: number;
  outcomesComputed: number;
  alertsCreated: number;
  followUpTasksCreated: number;
  aiInterpreted: number;
}

function toWindowMetrics(value: unknown): WindowMetrics {
  if (!value || typeof value !== "object") return EMPTY_WINDOW_METRICS;
  const v = value as Partial<WindowMetrics>;
  return { clicks: v.clicks ?? 0, impressions: v.impressions ?? 0, ctr: v.ctr ?? 0, position: v.position ?? null };
}

/** Only these two recommendations create a follow-up task (see
 * lib/outcomes/follow-up.ts) — this is the exhaustive mapping onto the
 * *existing* opportunity_type vocabulary, reusing the same
 * seo_opportunities/seo_tasks system every prior phase promotes into,
 * per spec section 15 ("do not create a parallel task system"). */
function opportunityTypeForRecommendation(recommendation: OutcomeRecommendation): OpportunityType {
  switch (recommendation) {
    case "INVESTIGATE_CTR":
      return "IMPROVE_CTR";
    case "DIAGNOSE_DECLINE":
    default:
      return "INVESTIGATE_DECLINE";
  }
}

/** Creates the follow-up task via the existing seo_opportunities/seo_tasks
 * system — maintains ORIGINAL OPPORTUNITY -> ORIGINAL TASK -> ACTION ->
 * MEASUREMENT -> OUTCOME -> FOLLOW-UP TASK traceability through
 * priority_components (same "signals snapshot" convention as
 * lib/jobs/handlers/search-performance-shared.ts's promotion step). */
async function createFollowUpTask(website: WebsiteRow, action: SeoActionRow, outcome: SeoActionOutcomeRow, recommendationResult: RecommendationResult) {
  const opportunityType = opportunityTypeForRecommendation(outcome.recommendation);
  const subject = action.target_url ?? action.target_keyword_text ?? "this action";
  const title = `${outcome.recommendation.replace(/_/g, " ")}: ${subject}`;

  const opportunity = await insertOpportunity({
    organization_id: website.organization_id,
    website_id: website.id,
    type: opportunityType,
    title,
    description: outcome.classification_reasoning,
    rationale: outcome.ai_interpretation ?? recommendationResult.reasoning,
    target_page_id: null,
    priority_score: outcome.classification === "NEGATIVE" ? 9 : 6,
    priority_components: {
      source: "action_outcome_followup",
      seo_action_id: action.id,
      seo_action_outcome_id: outcome.id,
      classification: outcome.classification,
      recommendation: outcome.recommendation,
    },
    effort_estimate: "medium",
  });

  return insertTask({
    organization_id: website.organization_id,
    website_id: website.id,
    opportunity_id: opportunity.id,
    title: opportunity.title,
    description: opportunity.description,
    type: opportunityType,
    priority: Math.round(opportunity.priority_score),
  });
}

/**
 * ANALYSE_ACTION_OUTCOMES — the background job that closes the loop (spec
 * section 11). For every EXECUTED action for this website: capture a
 * baseline once (if not already captured and enough history exists),
 * compute a deterministic outcome for every measurement window that has
 * elapsed, evaluate alert thresholds, and create at most one follow-up task
 * per outcome. A bounded, additive AI-interpretation pass runs last, over
 * every website's not-yet-interpreted outcomes together — never blocking
 * the deterministic work above it.
 */
export const handleAnalyseActionOutcomes: JobHandler = async ({ job }) => {
  if (!job.website_id) throw new Error("ANALYSE_ACTION_OUTCOMES job is missing website_id");
  const website = await getWebsite(job.website_id);
  if (!website) throw new Error(`Website ${job.website_id} not found`);

  const now = new Date();
  const actions = await listExecutedSeoActionsForWebsite(website.id);

  let baselinesCaptured = 0;
  let outcomesComputed = 0;
  let alertsCreated = 0;
  let followUpTasksCreated = 0;
  const autonomyAllows = autonomyAllowsRecommendations(website.autonomy_level);

  for (const action of actions) {
    if (!action.executed_at) continue;
    const executedAt = new Date(action.executed_at);
    const subject = { query: action.target_keyword_text, pageUrl: action.target_url };
    if (!subject.query && !subject.pageUrl) continue; // nothing to measure against — no keyword or URL was ever recorded for this action

    let baselineWindowDays = action.baseline_window_days;
    let baselineMetrics = toWindowMetrics(action.baseline_metrics);

    // --- Baseline capture (once, never overwritten afterwards) ---
    if (!action.baseline_captured_at) {
      const stats = await getSearchConsoleStatsForWebsite(website.id);
      const daysOfHistory = stats.earliestDate ? Math.floor((executedAt.getTime() - new Date(stats.earliestDate).getTime()) / DAY_MS) : 0;
      const windowDays = pickBaselineWindowDays(daysOfHistory);
      if (windowDays === null) continue; // not enough pre-action history yet -- try again on a later run

      const range = computeBaselineDateRange(executedAt, windowDays);
      const rows = await listSearchConsoleMetricsForSubjectInRange(website.id, subject, range.start, range.end);
      const metrics = aggregateWindowMetrics(rows);
      await captureSeoActionBaseline(action.id, {
        baselineWindowDays: windowDays,
        baselineStartDate: range.start,
        baselineEndDate: range.end,
        baselineMetrics: metrics as unknown as Record<string, unknown>,
      });
      baselinesCaptured++;
      baselineWindowDays = windowDays;
      baselineMetrics = metrics;
    }
    void baselineWindowDays; // retained for readability/debugging; not otherwise consumed below

    // --- Measurement windows due now ---
    const due = dueMeasurementWindows(executedAt, now);
    if (due.length === 0) continue;

    const isNewPage = action.action_type === "CREATE_NEW_PAGE";
    const existingOutcomes = await listOutcomesForAction(action.id);
    const previousOutcome = existingOutcomes.length > 0 ? existingOutcomes[existingOutcomes.length - 1] : null;

    for (const windowDays of due) {
      const range = computeMeasurementDateRange(executedAt, windowDays);
      const rows = await listSearchConsoleMetricsForSubjectInRange(website.id, subject, range.start, range.end);
      const currentMetrics = aggregateWindowMetrics(rows);

      const sufficiency = assessDataSufficiency(baselineMetrics, currentMetrics, isNewPage);
      const deltas = computeOutcomeDeltas(baselineMetrics, currentMetrics);
      const classificationResult = classifyOutcome(baselineMetrics, currentMetrics, deltas, sufficiency);
      const recommendationResult = recommendNextAction({
        classification: classificationResult.classification,
        ctrChangePoints: deltas.ctrChangePoints,
        clicksChangePct: deltas.clicksChangePct,
      });

      let lifecycleStage: PageLifecycleStage | null = null;
      if (isNewPage) {
        const daysSincePublish = Math.floor((now.getTime() - executedAt.getTime()) / DAY_MS);
        const previousMetrics = previousOutcome ? toWindowMetrics(previousOutcome.current_metrics) : null;
        const hasEverHadImpressions = currentMetrics.impressions > 0 || (previousMetrics?.impressions ?? 0) > 0;
        let impressionsChangePct: number | null = null;
        let clicksChangePct: number | null = null;
        if (previousMetrics) {
          const vsPrevious = computeOutcomeDeltas(previousMetrics, currentMetrics);
          impressionsChangePct = vsPrevious.impressionsChangePct;
          clicksChangePct = vsPrevious.clicksChangePct;
        }
        lifecycleStage = classifyPageLifecycleStage({ daysSincePublish, hasEverHadImpressions, currentWindowImpressions: currentMetrics.impressions, impressionsChangePct, clicksChangePct });
      }

      const outcomeRow = await upsertSeoActionOutcome({
        organizationId: website.organization_id,
        websiteId: website.id,
        seoActionId: action.id,
        measurementWindowDays: windowDays,
        windowStart: range.start,
        windowEnd: range.end,
        baselineMetrics: baselineMetrics as unknown as Record<string, unknown>,
        currentMetrics: currentMetrics as unknown as Record<string, unknown>,
        deltas: deltas as unknown as Record<string, unknown>,
        dataSufficient: sufficiency.sufficient,
        classification: classificationResult.classification,
        classificationReasoning: classificationResult.reasoning,
        recommendation: recommendationResult.recommendation,
        pageLifecycleStage: lifecycleStage,
      });
      outcomesComputed++;

      // --- Alerts (deduplicated at the DB layer per outcome+type) ---
      const alertCandidates = evaluateAlertCandidates({ classification: classificationResult.classification, deltas, isNewPage, currentImpressions: currentMetrics.impressions });
      for (const candidate of alertCandidates) {
        const inserted = await insertAlertIfNotExists({
          organizationId: website.organization_id,
          websiteId: website.id,
          seoActionId: action.id,
          seoActionOutcomeId: outcomeRow.id,
          alertType: candidate.alertType,
          severity: candidate.severity,
          message: candidate.message,
        });
        if (inserted) alertsCreated++;
      }

      // --- Closed-loop follow-up task (bounded to one per outcome) ---
      if (shouldCreateFollowUpTask({ recommendation: recommendationResult.recommendation, autonomyAllowsRecommendations: autonomyAllows, existingFollowUpTaskId: outcomeRow.follow_up_task_id })) {
        const followUpTask = await createFollowUpTask(website, action, outcomeRow, recommendationResult);
        await markOutcomeFollowUpTaskCreated(outcomeRow.id, followUpTask.id);
        followUpTasksCreated++;
      }
    }
  }

  const aiInterpreted = await runOutcomeAiInterpretationPass(website, job.id);

  const result: AnalyseActionOutcomesResult = { actionsConsidered: actions.length, baselinesCaptured, outcomesComputed, alertsCreated, followUpTasksCreated, aiInterpreted };
  return { ...result };
};

/** Bounded, additive-only AI interpretation pass over not-yet-interpreted
 * outcomes for this website — mirrors
 * lib/jobs/handlers/search-performance-shared.ts's runAiInterpretationPass
 * exactly: a failed/skipped AI call never blocks detection, measurement, or
 * follow-up task creation, all of which already happened above. */
async function runOutcomeAiInterpretationPass(website: WebsiteRow, jobId: string): Promise<number> {
  const toInterpret = await listUnanalysedOutcomesForWebsite(website.id, MAX_AI_INTERPRETATIONS_PER_RUN);
  if (toInterpret.length === 0) return 0;

  const actionsById = new Map<string, SeoActionRow>();
  for (const outcome of toInterpret) {
    if (!actionsById.has(outcome.seo_action_id)) {
      const action = await getSeoAction(outcome.seo_action_id);
      if (action) actionsById.set(outcome.seo_action_id, action);
    }
  }

  const prompt = buildActionOutcomeUserPrompt({
    websiteName: website.name,
    baseUrl: website.base_url,
    outcomes: toInterpret.map((o) => {
      const action = actionsById.get(o.seo_action_id);
      return {
        id: o.id,
        actionType: action?.action_type ?? "UNKNOWN",
        targetUrl: action?.target_url ?? null,
        targetKeyword: action?.target_keyword_text ?? null,
        classification: o.classification,
        classificationReasoning: o.classification_reasoning,
        recommendation: o.recommendation,
        measurementWindowDays: o.measurement_window_days,
        deltas: o.deltas as Record<string, unknown>,
        pageLifecycleStage: o.page_lifecycle_stage,
        // Not wired up in this phase -- see README's Phase 6 limitations.
        // Never fabricated: the AI schema/prompt both explicitly forbid
        // referencing competitor activity when this is empty.
        competitorContext: [] as string[],
      };
    }),
  });

  const aiJob = await createAiJob({
    organization_id: website.organization_id,
    job_id: jobId,
    provider: "anthropic",
    model: getAIProvider().defaultModel,
    prompt_version: ACTION_OUTCOME_PROMPT_VERSION,
    purpose: "action_outcome_interpretation",
    input_summary: { outcome_count: toInterpret.length },
    status: "PROCESSING",
  });

  try {
    const aiResult = await getAIProvider().generateStructuredOutput({
      system: ACTION_OUTCOME_SYSTEM_PROMPT,
      prompt,
      schema: actionOutcomeInterpretationSchema,
      jsonSchema: actionOutcomeInterpretationJsonSchema,
      schemaName: "action_outcome_interpretation",
    });
    await completeAiJob(aiJob.id, {
      status: "COMPLETED",
      result: { interpretation_count: aiResult.data.interpretations.length },
      prompt_tokens: aiResult.usage.promptTokens,
      completion_tokens: aiResult.usage.completionTokens,
      total_tokens: aiResult.usage.totalTokens,
      latency_ms: aiResult.latencyMs,
    });

    const validIds = new Set(toInterpret.map((o) => o.id));
    let interpreted = 0;
    for (const item of aiResult.data.interpretations) {
      if (!validIds.has(item.outcome_id)) continue; // ignore any id the model didn't actually receive
      const combined = `${item.interpretation} Next: ${item.next_step_note}`;
      await recordOutcomeAiInterpretation(item.outcome_id, combined, item.risk_notes);
      interpreted++;
    }
    return interpreted;
  } catch (error) {
    await completeAiJob(aiJob.id, { status: "FAILED", error: error instanceof Error ? error.message : String(error) });
    console.warn(`[jobs] action-outcome AI interpretation failed for website ${website.id}, continuing without it:`, error);
    return 0;
  }
}
