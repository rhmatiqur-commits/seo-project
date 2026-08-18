/**
 * Phase 7.1D: turns a flat, unbounded list of opportunities (today, often
 * 78+ rows sorted only by priority_score) into the grouped, boundable shape
 * the Opportunities page renders. Pure and reused by both the list page and
 * its tests — no new scoring, just presentation of the existing
 * priority_score the AI/detector pipelines already compute (see
 * lib/ai/seo-analysis.ts's priorityScore()).
 */

export type ImpactTier = "high" | "medium" | "low";

/** Same 10/5 thresholds the Opportunities page has used since Phase 7 —
 * unchanged, just centralised so the list and detail views agree. */
export function impactTier(score: number): ImpactTier {
  if (score >= 10) return "high";
  if (score >= 5) return "medium";
  return "low";
}

export const IMPACT_TIER_LABEL: Record<ImpactTier, string> = {
  high: "High impact",
  medium: "Medium impact",
  low: "Low impact",
};

/** dash-badge tone per tier — matches the existing impactLabel() precedent
 * (high -> danger/red for attention-grabbing, medium -> warning, low -> info). */
export const IMPACT_TIER_TONE: Record<ImpactTier, string> = {
  high: "danger",
  medium: "warning",
  low: "info",
};

export const IMPACT_TIER_ORDER: readonly ImpactTier[] = ["high", "medium", "low"];

export interface ScoredOpportunity {
  priority_score: number;
}

/** Groups by impact tier, each group kept in descending priority_score
 * order (the same order listOpportunitiesForWebsite already returns). */
export function groupByImpactTier<T extends ScoredOpportunity>(opportunities: readonly T[]): Record<ImpactTier, T[]> {
  const groups: Record<ImpactTier, T[]> = { high: [], medium: [], low: [] };
  for (const o of opportunities) {
    groups[impactTier(o.priority_score)].push(o);
  }
  for (const tier of IMPACT_TIER_ORDER) {
    groups[tier].sort((a, b) => b.priority_score - a.priority_score);
  }
  return groups;
}

/** Default number of cards shown per impact group before "Show N more" —
 * keeps a 78-opportunity website from rendering an unbroken wall of cards. */
export const DEFAULT_VISIBLE_PER_GROUP = 5;

export interface VisibleSplit<T> {
  visible: T[];
  remaining: number;
}

export function splitVisible<T>(items: readonly T[], visibleCount: number = DEFAULT_VISIBLE_PER_GROUP): VisibleSplit<T> {
  const count = Math.max(0, visibleCount);
  return {
    visible: items.slice(0, count),
    remaining: Math.max(0, items.length - count),
  };
}

/** Word-boundary truncation for the card's rationale teaser — the full
 * rationale only appears on the detail view (spec: "Do not show the full
 * AI rationale on every card"). */
export function truncateText(text: string, maxLength = 140): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) return trimmed;
  const cut = trimmed.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(" ");
  const boundary = lastSpace > maxLength * 0.6 ? lastSpace : maxLength;
  return `${cut.slice(0, boundary).trimEnd()}…`;
}

export type OpportunitiesViewState = "no-data" | "has-new" | "only-dismissed" | "only-accepted" | "all-caught-up";

export interface StatusedOpportunity {
  status: string;
}

/**
 * Selects which of the four named empty/summary states (spec section 12)
 * applies to the whole, unfiltered opportunity list — independent of
 * whatever a user's filters/search currently hide.
 */
export function selectOpportunitiesViewState(opportunities: readonly StatusedOpportunity[]): OpportunitiesViewState {
  if (opportunities.length === 0) return "no-data";
  const open = opportunities.filter((o) => o.status === "new");
  if (open.length > 0) return "has-new";
  if (opportunities.every((o) => o.status === "rejected")) return "only-dismissed";
  if (opportunities.every((o) => o.status === "approved")) return "only-accepted";
  return "all-caught-up";
}
