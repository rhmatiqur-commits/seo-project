import type { OpportunityStatus, OpportunityType } from "@/lib/supabase/types";
import { isContentEligibleOpportunityType } from "@/lib/content/eligibility";
import { impactTier, IMPACT_TIER_LABEL, IMPACT_TIER_TONE } from "./opportunity-groups";
import { opportunityStatusLabel, opportunityTypeLabel } from "./opportunity-labels";
import { truncateText } from "./opportunity-groups";

/**
 * Phase 7.1D: pure view-model builders — the only place that decides what
 * an opportunity's card and detail page actually show. Keeping this out of
 * the .tsx files makes it testable without rendering React, and guarantees
 * the card teaser and the detail page derive impact/type/status labels the
 * same way instead of two components each reimplementing the mapping.
 */
export interface OpportunitySourceRow {
  id: string;
  title: string;
  description: string;
  rationale: string;
  type: OpportunityType;
  status: OpportunityStatus;
  priority_score: number;
  target_page_id: string | null;
  updated_at: string;
}

export interface DetectorSourceRow {
  reasoning: string;
}

export interface PageSourceRow {
  url: string;
}

export interface OpportunityCardViewModel {
  id: string;
  title: string;
  description: string;
  rationaleTeaser: string;
  type: OpportunityType;
  typeLabel: string;
  status: OpportunityStatus;
  statusLabel: string;
  impactTier: ReturnType<typeof impactTier>;
  impactLabel: string;
  impactTone: string;
  priority_score: number;
  affectedPageUrl: string | null;
}

export function buildOpportunityCardViewModel(opportunity: OpportunitySourceRow, page: PageSourceRow | null): OpportunityCardViewModel {
  const tier = impactTier(opportunity.priority_score);
  return {
    id: opportunity.id,
    title: opportunity.title,
    description: opportunity.description,
    rationaleTeaser: truncateText(opportunity.rationale, 140),
    type: opportunity.type,
    typeLabel: opportunityTypeLabel(opportunity.type),
    status: opportunity.status,
    statusLabel: opportunityStatusLabel(opportunity.status),
    impactTier: tier,
    impactLabel: IMPACT_TIER_LABEL[tier],
    impactTone: IMPACT_TIER_TONE[tier],
    priority_score: opportunity.priority_score,
    affectedPageUrl: page?.url ?? null,
  };
}

export interface OpportunityDetailViewModel {
  id: string;
  title: string;
  description: string;
  rationale: string;
  type: OpportunityType;
  typeLabel: string;
  status: OpportunityStatus;
  statusLabel: string;
  impactLabel: string;
  impactTone: string;
  affectedPageUrl: string | null;
  /** The detector's own written reasoning, when this opportunity was
   * promoted from a search-performance detector row. Never fabricated for
   * AI-generated opportunities that have no such row (spec: "For
   * AI-generated opportunities where detector reasoning does not exist, do
   * not invent one"). */
  detectorExplanation: string | null;
  contentEligible: boolean;
}

export function buildOpportunityDetailViewModel(
  opportunity: OpportunitySourceRow,
  detector: DetectorSourceRow | null,
  page: PageSourceRow | null
): OpportunityDetailViewModel {
  const tier = impactTier(opportunity.priority_score);
  const reasoning = detector?.reasoning?.trim();
  return {
    id: opportunity.id,
    title: opportunity.title,
    description: opportunity.description,
    rationale: opportunity.rationale,
    type: opportunity.type,
    typeLabel: opportunityTypeLabel(opportunity.type),
    status: opportunity.status,
    statusLabel: opportunityStatusLabel(opportunity.status),
    impactLabel: IMPACT_TIER_LABEL[tier],
    impactTone: IMPACT_TIER_TONE[tier],
    affectedPageUrl: page?.url ?? null,
    detectorExplanation: reasoning && reasoning.length > 0 ? reasoning : null,
    contentEligible: isContentEligibleOpportunityType(opportunity.type),
  };
}
