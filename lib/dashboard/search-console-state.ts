/**
 * Phase 7.1C: which of the three Search Console states the dashboard should
 * render — never zeroes for a disconnected site, never a false "connected"
 * read for a connection that exists but hasn't synced anything yet. Pure
 * selection over data the page already fetches (search_console_connections'
 * status column via lib/db/search-console.ts's getSearchConsoleConnection,
 * and the totalRows count from getSearchConsoleStatsForWebsite) — no new
 * query, no new status value.
 */
export type SearchConsoleDisplayState = "NOT_CONNECTED" | "CONNECTED_NO_DATA" | "CONNECTED_WITH_DATA";

/**
 * Any connection status other than 'active' (no row at all, still
 * 'pending_site_selection', or 'error') reads as NOT_CONNECTED from the
 * client's point of view — the distinction between those technical reasons
 * belongs to Settings, not the dashboard overview.
 */
export function getSearchConsoleDisplayState(connectionStatus: string | null | undefined, totalRows: number): SearchConsoleDisplayState {
  if (connectionStatus !== "active") return "NOT_CONNECTED";
  if (totalRows <= 0) return "CONNECTED_NO_DATA";
  return "CONNECTED_WITH_DATA";
}
