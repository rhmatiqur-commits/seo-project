import type { OpportunityType } from "@/lib/supabase/types";

/**
 * A seo_opportunities row is eligible for content-brief generation iff its
 * type is one that actually means "write/rewrite a page". This is the single
 * gate the spec's mixed list of "initial supported opportunity types"
 * reduces to: CONTENT_GAP/COMPETITOR_CONTENT_GAP/PAGE_TWO_OPPORTUNITY are
 * search_performance_detector_type values, not opportunity_type values —
 * by the time any of those detectors reach seo_opportunities, they've
 * already resolved to CREATE_NEW_PAGE or OPTIMISE_EXISTING_PAGE (see
 * lib/search-performance/detectors/*), so gating on opportunity_type alone
 * covers every one of them without a second, overlapping enum check.
 */
const CONTENT_ELIGIBLE_TYPES: ReadonlySet<OpportunityType> = new Set(["CREATE_NEW_PAGE", "OPTIMISE_EXISTING_PAGE"]);

export function isContentEligibleOpportunityType(type: OpportunityType): boolean {
  return CONTENT_ELIGIBLE_TYPES.has(type);
}
