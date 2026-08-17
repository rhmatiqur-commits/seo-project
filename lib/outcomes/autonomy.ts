import type { AutonomyLevel } from "@/lib/supabase/types";

/**
 * Phase 6 autonomy-level policy (spec section 14). Every level
 * (MANUAL/AI_RECOMMENDS/AI_PREPARES/AI_EXECUTES) is schema-ready on
 * websites.autonomy_level, but this phase enforces exactly one rule
 * regardless of which level a website is configured with: outcome analysis
 * may collect data (baselines/outcomes/alerts) and create *recommendations*
 * (follow-up seo_tasks) but must never itself publish or modify content.
 *
 * AI_PREPARES/AI_EXECUTES are accepted, valid values — the enum and this
 * function exist so a later phase can implement real escalated automation
 * against them — but no code path in this repository currently checks for
 * "is this AI_EXECUTES" to skip human approval. This function is what keeps
 * that true structurally: it always returns false, so even a future caller
 * that forgets to gate a content mutation on it fails closed, not open.
 */
export function autonomyAllowsAutomaticContentChange(_level: AutonomyLevel): boolean {
  return false;
}

/**
 * Whether outcome analysis is allowed to create follow-up *recommendations*
 * (seo_tasks) for a website at all. MANUAL means "don't recommend anything
 * automatically either" — matching an operator/client who wants zero
 * platform-initiated activity, only passive measurement. Every other level
 * (AI_RECOMMENDS and above) allows recommendations; none of them allow
 * skipping human approval for an actual content change (see
 * autonomyAllowsAutomaticContentChange above).
 */
export function autonomyAllowsRecommendations(level: AutonomyLevel): boolean {
  return level !== "MANUAL";
}
