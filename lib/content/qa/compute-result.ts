import { QA_PASS_SCORE_THRESHOLD } from "@/lib/content/limits";
import type { DeterministicCheckResult } from "@/lib/content/qa/deterministic";
import type { ContentQaDraft } from "@/lib/ai/schemas";

export interface QaIssue {
  severity: "blocking" | "warning";
  category: string;
  message: string;
}

export interface QaComputedResult {
  passed: boolean;
  score: number; // 0-100
  issues: QaIssue[];
}

// Deterministic pass-rate contributes most of the score (it's the safety
// net); AI dimension ratings (1-5 each) contribute the rest, averaged and
// rescaled to 0-100 — TypeScript computes this number, never the model.
const DETERMINISTIC_WEIGHT = 0.6;
const AI_WEIGHT = 0.4;

function deterministicScore(checks: DeterministicCheckResult[]): number {
  if (checks.length === 0) return 100;
  const passedCount = checks.filter((c) => c.passed).length;
  return (passedCount / checks.length) * 100;
}

function aiScore(ai: ContentQaDraft): number {
  const dimensions = [ai.search_intent_alignment, ai.topical_coverage, ai.usefulness, ai.clarity, ai.business_relevance, ai.competitor_gap_coverage];
  const average = dimensions.reduce((a, b) => a + b, 0) / dimensions.length; // 1-5
  let scaled = ((average - 1) / 4) * 100; // 1-5 -> 0-100
  if (ai.feels_generic_or_repetitive) scaled -= 15;
  if (!ai.addresses_likely_question) scaled -= 15;
  return Math.max(0, Math.min(100, scaled));
}

/**
 * Combines deterministic checks with an optional AI QA rating into a single
 * pass/fail + 0-100 score + issue list. `ai` is null when the AI QA call was
 * skipped/failed (soft failure, same pattern as the search-performance AI
 * interpretation pass) — the result is still valid, deterministic-only.
 * `passed` requires every BLOCKING deterministic check to pass, regardless
 * of score — AI is additive/informative, never gating by itself.
 */
export function computeQaResult(checks: DeterministicCheckResult[], ai: ContentQaDraft | null): QaComputedResult {
  const blockingFailures = checks.filter((c) => c.severity === "blocking" && !c.passed);
  const warnings = checks.filter((c) => c.severity === "warning" && !c.passed);

  const detScore = deterministicScore(checks);
  const score = ai === null ? detScore : detScore * DETERMINISTIC_WEIGHT + aiScore(ai) * AI_WEIGHT;

  const issues: QaIssue[] = [
    ...blockingFailures.map((c): QaIssue => ({ severity: "blocking", category: c.id, message: c.message })),
    ...warnings.map((c): QaIssue => ({ severity: "warning", category: c.id, message: c.message })),
  ];
  if (ai?.feels_generic_or_repetitive) issues.push({ severity: "warning", category: "ai_generic_feel", message: "AI reviewer flagged this draft as generic or repetitive." });
  if (ai && !ai.addresses_likely_question) issues.push({ severity: "warning", category: "ai_intent_gap", message: "AI reviewer flagged that the content may not address the likely search intent." });
  if (ai) issues.push({ severity: "warning", category: "ai_notes", message: ai.notes });

  const passed = blockingFailures.length === 0 && score >= QA_PASS_SCORE_THRESHOLD;

  return { passed, score: Math.round(score * 100) / 100, issues };
}
