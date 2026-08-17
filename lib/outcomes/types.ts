/**
 * Shared pure types for the Autonomous SEO Optimisation Loop (Phase 6).
 * Nothing here touches the DB or an AI provider — see
 * lib/jobs/handlers/analyse-action-outcomes.ts for the composition layer.
 */

/** One period's aggregated Search Console signal for a single subject (a
 * keyword or a URL) — the output of lib/outcomes/aggregate.ts, the input to
 * lib/outcomes/deltas.ts. */
export interface WindowMetrics {
  clicks: number;
  impressions: number;
  /** Always clicks/impressions, recomputed — never averaged from stored per-row ctr. 0 when impressions is 0. */
  ctr: number;
  /** Impressions-weighted average position, or null if no row in the window had a position. */
  position: number | null;
}

/** Minimal shape lib/outcomes/aggregate.ts needs from a raw
 * search_console_metrics row — deliberately narrower than the full DB row so
 * the pure function has no DB dependency. */
export interface RawMetricRow {
  clicks: number;
  impressions: number;
  position: number | null;
}

export interface OutcomeDeltas {
  clicksChange: number;
  /** null when baseline clicks was 0 — a percentage isn't meaningful there. */
  clicksChangePct: number | null;
  impressionsChange: number;
  /** null when baseline impressions was 0. */
  impressionsChangePct: number | null;
  /** current.ctr - baseline.ctr, expressed in percentage points (e.g. 2 means +2pp, not +2%). */
  ctrChangePoints: number;
  /** baseline.position - current.position. POSITIVE means improvement (a
   * smaller/better rank number) — "14 -> 9" yields +5. Null if either side
   * has no position data. */
  positionChange: number | null;
}
