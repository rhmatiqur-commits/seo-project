import { impactTier, type ImpactTier } from "./opportunity-groups";

/**
 * Phase 7.1D: the predicate behind OpportunityFilters. Pure so it's testable
 * without React, and reused identically for the "new" cards and the
 * "previously reviewed" table so both react to the same filter bar.
 * Operates over the opportunity list the page already fetched — filtering
 * never triggers a new database query (spec: "Do not introduce unnecessary
 * new database queries").
 */
export interface FilterableOpportunity {
  type: string;
  status: string;
  priority_score: number;
  title: string;
  description: string;
}

export interface OpportunityFilterState {
  type: string | "all";
  impact: ImpactTier | "all";
  status: string | "all";
  search: string;
}

export const DEFAULT_OPPORTUNITY_FILTERS: OpportunityFilterState = {
  type: "all",
  impact: "all",
  status: "all",
  search: "",
};

/** Search matches title/description only — never rationale (spec: "Do not
 * search rationale", to avoid surfacing long AI prose as false-positive
 * matches). */
export function filterOpportunities<T extends FilterableOpportunity>(items: readonly T[], filters: OpportunityFilterState): T[] {
  const query = filters.search.trim().toLowerCase();
  return items.filter((o) => {
    if (filters.type !== "all" && o.type !== filters.type) return false;
    if (filters.impact !== "all" && impactTier(o.priority_score) !== filters.impact) return false;
    if (filters.status !== "all" && o.status !== filters.status) return false;
    if (query && !o.title.toLowerCase().includes(query) && !o.description.toLowerCase().includes(query)) return false;
    return true;
  });
}

export function hasActiveFilters(filters: OpportunityFilterState): boolean {
  return filters.type !== "all" || filters.impact !== "all" || filters.status !== "all" || filters.search.trim() !== "";
}
