"use client";

import { useState } from "react";
import { EmptyState } from "./EmptyState";
import { OpportunityCard } from "./OpportunityCard";
import { OpportunityFilters } from "./OpportunityFilters";
import type { OpportunityCardViewModel } from "@/lib/dashboard/opportunity-detail";
import { DEFAULT_OPPORTUNITY_FILTERS, filterOpportunities, hasActiveFilters, type OpportunityFilterState } from "@/lib/dashboard/opportunity-filters";
import { groupByImpactTier, splitVisible, IMPACT_TIER_ORDER, IMPACT_TIER_LABEL, DEFAULT_VISIBLE_PER_GROUP, type OpportunitiesViewState } from "@/lib/dashboard/opportunity-groups";

export interface OpportunityBrowserProps {
  cards: OpportunityCardViewModel[];
  totalNewCount: number;
  viewState: OpportunitiesViewState;
  orgSlug: string;
  canAct: boolean;
  acceptAction: (formData: FormData) => Promise<void>;
  dismissAction: (formData: FormData) => Promise<void>;
}

const VIEW_STATE_COPY: Partial<Record<OpportunitiesViewState, { title: string; description: string }>> = {
  "all-caught-up": {
    title: "You're caught up",
    description: "There are no new opportunities to review right now — everything found so far has already been decided.",
  },
  "only-dismissed": {
    title: "No new opportunities right now",
    description: "Every opportunity found so far has been dismissed. We check for new ones on a regular schedule.",
  },
  "only-accepted": {
    title: "Your reviewed opportunities",
    description: "Everything found so far has been accepted and is now with the team.",
  },
};

/**
 * Phase 7.1D: the interactive core of the Opportunities page — filtering,
 * search, per-impact grouping with "Show N more", and the previously
 * reviewed table, all operating over the single opportunity list the page
 * already fetched server-side (no new queries fire as filters change).
 * A client component only because filtering/expanding needs local state;
 * Accept/Dismiss stay real Server Actions passed in from the page.
 */
export function OpportunityBrowser({ cards, totalNewCount, viewState, orgSlug, canAct, acceptAction, dismissAction }: OpportunityBrowserProps) {
  const [filters, setFilters] = useState<OpportunityFilterState>(DEFAULT_OPPORTUNITY_FILTERS);
  const [visibleCounts, setVisibleCounts] = useState<Record<string, number>>({});

  if (viewState === "no-data") {
    return (
      <EmptyState
        title="Nothing detected yet"
        description="We check for new opportunities on a regular schedule — check back after your next SEO analysis."
      />
    );
  }

  const filtered = filterOpportunities(cards, filters);
  const filteredOpen = filtered.filter((o) => o.status === "new");
  const filteredDecided = filtered.filter((o) => o.status !== "new");
  const groups = groupByImpactTier(filteredOpen);
  const summary = VIEW_STATE_COPY[viewState];

  return (
    <>
      {viewState === "has-new" ? (
        <p className="dash-page-subtitle">
          The platform found {totalNewCount} new opportunit{totalNewCount === 1 ? "y" : "ies"} and ranked{" "}
          {totalNewCount === 1 ? "it" : "them"} by potential impact. Nothing requires your attention until you decide.
        </p>
      ) : (
        summary && <EmptyState title={summary.title} description={summary.description} />
      )}

      <OpportunityFilters filters={filters} onChange={setFilters} />

      {viewState === "has-new" && filteredOpen.length === 0 && hasActiveFilters(filters) && (
        <p className="dash-muted" style={{ fontSize: "0.88rem", marginBottom: 20 }}>
          No new opportunities match your filters.
        </p>
      )}

      {IMPACT_TIER_ORDER.filter((tier) => groups[tier].length > 0).map((tier) => {
        const visibleCount = visibleCounts[tier] ?? DEFAULT_VISIBLE_PER_GROUP;
        const { visible, remaining } = splitVisible(groups[tier], visibleCount);
        return (
          <section key={tier} className="dash-section">
            <h2 className="dash-subsection-heading">{IMPACT_TIER_LABEL[tier]}</h2>
            <div className="dash-grid" style={{ marginBottom: 12 }}>
              {visible.map((o) => (
                <OpportunityCard key={o.id} opportunity={o} orgSlug={orgSlug} canAct={canAct} acceptAction={acceptAction} dismissAction={dismissAction} />
              ))}
            </div>
            {remaining > 0 && (
              <button
                type="button"
                className="dash-btn ghost"
                onClick={() => setVisibleCounts((prev) => ({ ...prev, [tier]: visibleCount + remaining }))}
              >
                Show {remaining} more
              </button>
            )}
          </section>
        );
      })}

      {filteredDecided.length > 0 && (
        <section className="dash-section">
          <h2 className="dash-subsection-heading">Previously reviewed</h2>
          <div className="dash-table-wrap">
            <table className="dash-table responsive">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Type</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredDecided.map((o) => (
                  <tr key={o.id}>
                    <td data-label="Title">
                      <a href={`/dashboard/${orgSlug}/opportunities/${o.id}`} className="dash-muted">
                        {o.title}
                      </a>
                    </td>
                    <td className="dash-muted" data-label="Type">
                      {o.typeLabel}
                    </td>
                    <td data-label="Status">
                      <span className={`dash-badge ${o.status === "rejected" ? "danger" : "success"}`}>{o.statusLabel}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
