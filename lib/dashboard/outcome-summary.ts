import type { OutcomeClassification } from "@/lib/supabase/types";

/**
 * Phase 7.1C: maps seo_action_outcomes.classification counts (from
 * lib/db/seo-action-outcomes.ts's getSeoActionOutcomeStatsForWebsite) onto
 * the five summary groups the Results section shows — reusing the exact
 * labels outcomes/page.tsx already defined (CLASSIFICATION_LABEL), not new
 * wording. The classification meanings themselves are decided entirely by
 * lib/outcomes/classify.ts; nothing here reinterprets them.
 */
export interface OutcomeSummaryGroup {
  key: OutcomeClassification;
  label: string;
  tone: string;
  count: number;
}

const GROUPS: ReadonlyArray<{ key: OutcomeClassification; label: string; tone: string }> = [
  { key: "POSITIVE", label: "Improved", tone: "success" },
  { key: "NEGATIVE", label: "Declined", tone: "danger" },
  { key: "MIXED", label: "Mixed result", tone: "warning" },
  { key: "INCONCLUSIVE", label: "No clear change yet", tone: "info" },
  { key: "INSUFFICIENT_DATA", label: "Still gathering data", tone: "neutral" },
];

export function buildOutcomeSummary(byClassification: Record<string, number>): OutcomeSummaryGroup[] {
  return GROUPS.map((g) => ({ ...g, count: byClassification[g.key] ?? 0 }));
}
