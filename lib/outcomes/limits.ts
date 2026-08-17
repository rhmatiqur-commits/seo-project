/**
 * Named, documented thresholds for the Autonomous SEO Optimisation Loop
 * (Phase 6) — same "cheap named constant instead of a magic number buried in
 * a detector" convention as every prior phase's limits.ts
 * (lib/search-performance/limits.ts, lib/content/limits.ts, etc.).
 */

// --- Baseline window (spec section 3) ---

/** Default pre-action baseline window. */
export const BASELINE_DEFAULT_WINDOW_DAYS = 28;
/** Used when there isn't enough pre-action history for the default window. */
export const BASELINE_FALLBACK_WINDOW_DAYS = 7;
/** Below this many days of Search Console history *before* an action's
 * executed_at, even the fallback window can't be trusted — baseline capture
 * is skipped entirely (not computed from a near-empty window) until more
 * history accumulates. */
export const MIN_BASELINE_HISTORY_DAYS = 7;

// --- Measurement windows (spec section 4) ---

/** Every window this platform ever computes an outcome for, in order. A
 * window is only computed once it has actually elapsed since the action's
 * executed_at — see lib/outcomes/windows.ts's isMeasurementWindowDue. */
export const MEASUREMENT_WINDOWS_DAYS = [7, 14, 28, 56] as const;

// --- Minimum-data / noise thresholds (spec section 7) ---

/** Below this many impressions in a period, that period is too noisy to
 * trust for comparison — mirrors search-performance's
 * MIN_BASELINE_IMPRESSIONS_FOR_COMPARISON, same reasoning, separate
 * constant because Phase 6 compares a different pair of periods. */
export const MIN_IMPRESSIONS_FOR_COMPARISON = 20;

// --- Classification thresholds (spec section 6) — deliberately percentage-
// based for traffic (absolute deltas mean different things at different
// scales) and position-based (in rank positions, already scale-free) for
// ranking. No single one of these decides an outcome by itself; see
// lib/outcomes/classify.ts. ---

/** A clicks or impressions percentage change at or beyond this magnitude
 * counts as a real, reportable movement (positive or negative). */
export const MEANINGFUL_TRAFFIC_CHANGE_PCT = 15;
/** A position improvement/decline at or beyond this many positions counts as
 * a meaningful ranking movement for classification purposes. */
export const MEANINGFUL_POSITION_CHANGE = 2;

// --- New-page lifecycle (spec section 8) ---

/** Impressions/clicks percentage growth at or beyond this, versus the
 * previous measurement window, counts as "GROWING" momentum. */
export const LIFECYCLE_GROWTH_CHANGE_PCT = 20;
/** Days since publish within which a page with zero impressions is still
 * labeled "NEW" rather than "DISCOVERED" — it simply hasn't shown up in
 * Search Console data yet, not evidence of any indexing problem. */
export const LIFECYCLE_DISCOVERY_GRACE_DAYS = 14;

// --- AI interpretation (mirrors search-performance's own constant) ---

/** Hard cap on how many not-yet-interpreted outcomes get sent to the AI
 * provider in one ANALYSE_ACTION_OUTCOMES run — bounds cost/latency. */
export const MAX_AI_INTERPRETATIONS_PER_RUN = 10;

// --- Alerts (spec section 18) — only fire when a threshold is exceeded, so
// the platform doesn't spam an operator on every small movement. ---

export const ALERT_TRAFFIC_DECLINE_CLICKS_PCT = 30;
export const ALERT_RANKING_DECLINE_POSITIONS = 5;
export const ALERT_SUCCESSFUL_IMPROVEMENT_CLICKS_PCT = 30;
export const ALERT_NEW_PAGE_TRACTION_IMPRESSIONS = 100;
