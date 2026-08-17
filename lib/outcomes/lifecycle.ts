import { LIFECYCLE_DISCOVERY_GRACE_DAYS, LIFECYCLE_GROWTH_CHANGE_PCT } from "@/lib/outcomes/limits";
import type { PageLifecycleStage } from "@/lib/supabase/types";

export interface LifecycleInput {
  daysSincePublish: number;
  /** True if this URL has ever had a non-zero-impression search_console_metrics row, in any period. */
  hasEverHadImpressions: boolean;
  currentWindowImpressions: number;
  /** vs the *previous* measurement window (not the pre-action baseline) — null if there is no previous window yet. */
  impressionsChangePct: number | null;
  clicksChangePct: number | null;
}

/**
 * New-page lifecycle staging (spec section 8): NEW -> DISCOVERED -> VISIBLE
 * -> GROWING -> STABLE -> DECLINING. Deliberately cautious: "VISIBLE" only
 * ever means Search Console has recorded impressions for this URL — evidence
 * of visibility, not a claim about Google's indexing mechanics (the spec's
 * own "INDEXED/VISIBLE" is collapsed to VISIBLE here for exactly that
 * reason — this platform cannot see indexing status, only impressions).
 * "DISCOVERED" is similarly not a crawl-discovery claim, just "published a
 * while ago, no impressions observed yet".
 */
export function classifyPageLifecycleStage(input: LifecycleInput): PageLifecycleStage {
  if (!input.hasEverHadImpressions) {
    return input.daysSincePublish <= LIFECYCLE_DISCOVERY_GRACE_DAYS ? "NEW" : "DISCOVERED";
  }

  if (input.currentWindowImpressions === 0) {
    // Had impressions before, has none in the current window -- a real
    // decline, distinct from "never observed any impressions" above.
    return "DECLINING";
  }

  const growing =
    (input.impressionsChangePct !== null && input.impressionsChangePct >= LIFECYCLE_GROWTH_CHANGE_PCT) ||
    (input.clicksChangePct !== null && input.clicksChangePct >= LIFECYCLE_GROWTH_CHANGE_PCT);
  if (growing) return "GROWING";

  const declining =
    input.impressionsChangePct !== null &&
    input.impressionsChangePct <= -LIFECYCLE_GROWTH_CHANGE_PCT &&
    (input.clicksChangePct === null || input.clicksChangePct <= -LIFECYCLE_GROWTH_CHANGE_PCT);
  if (declining) return "DECLINING";

  // Has impressions, not meaningfully trending either way (including the
  // first window with data at all, where there's no previous window to
  // compare against) -- "VISIBLE" for a brand-new page's first measured
  // window, "STABLE" once there's a comparison and it's flat.
  if (input.impressionsChangePct === null && input.clicksChangePct === null) return "VISIBLE";
  return "STABLE";
}
