"use client";

import type { OpportunityFilterState } from "@/lib/dashboard/opportunity-filters";
import { IMPACT_TIER_ORDER, IMPACT_TIER_LABEL, type ImpactTier } from "@/lib/dashboard/opportunity-groups";
import { allOpportunityTypes, allOpportunityStatuses, opportunityTypeLabel, opportunityStatusLabel } from "@/lib/dashboard/opportunity-labels";
import type { OpportunityStatus, OpportunityType } from "@/lib/supabase/types";

export interface OpportunityFiltersProps {
  filters: OpportunityFilterState;
  onChange: (next: OpportunityFilterState) => void;
}

/**
 * Phase 7.1D: type/impact/status/search filter bar. Filters the opportunity
 * list the page already fetched (see OpportunityBrowser) — changing a
 * filter never triggers a new request. Reuses the existing
 * .dash-form-row/.dash-field pattern from Settings' invite form rather than
 * introducing new form styling.
 */
export function OpportunityFilters({ filters, onChange }: OpportunityFiltersProps) {
  return (
    <div className="dash-form-row" style={{ marginBottom: 20 }}>
      <div className="dash-field" style={{ minWidth: 200, flex: "1 1 220px" }}>
        <label htmlFor="opp-search">Search</label>
        <input
          id="opp-search"
          type="search"
          placeholder="Search title or description"
          value={filters.search}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
        />
      </div>
      <div className="dash-field" style={{ minWidth: 170 }}>
        <label htmlFor="opp-type">Type</label>
        <select id="opp-type" value={filters.type} onChange={(e) => onChange({ ...filters, type: e.target.value as OpportunityType | "all" })}>
          <option value="all">All types</option>
          {allOpportunityTypes().map((type) => (
            <option key={type} value={type}>
              {opportunityTypeLabel(type)}
            </option>
          ))}
        </select>
      </div>
      <div className="dash-field" style={{ minWidth: 150 }}>
        <label htmlFor="opp-impact">Impact</label>
        <select id="opp-impact" value={filters.impact} onChange={(e) => onChange({ ...filters, impact: e.target.value as ImpactTier | "all" })}>
          <option value="all">All impact</option>
          {IMPACT_TIER_ORDER.map((tier) => (
            <option key={tier} value={tier}>
              {IMPACT_TIER_LABEL[tier]}
            </option>
          ))}
        </select>
      </div>
      <div className="dash-field" style={{ minWidth: 150 }}>
        <label htmlFor="opp-status">Status</label>
        <select id="opp-status" value={filters.status} onChange={(e) => onChange({ ...filters, status: e.target.value as OpportunityStatus | "all" })}>
          <option value="all">All statuses</option>
          {allOpportunityStatuses().map((status) => (
            <option key={status} value={status}>
              {opportunityStatusLabel(status)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
