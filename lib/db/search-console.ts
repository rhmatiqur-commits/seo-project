import { supabaseAdmin } from "@/lib/supabase/server";
import type { Database, SearchConsoleConnectionStatus } from "@/lib/supabase/types";
import type { NormalizedSearchConsoleMetric } from "@/lib/search-console/normalize";

type ConnectionRow = Database["public"]["Tables"]["search_console_connections"]["Row"];
type MetricRow = Database["public"]["Tables"]["search_console_metrics"]["Row"];
type WebsiteRow = Database["public"]["Tables"]["websites"]["Row"];

// ---------------------------------------------------------------------------
// search_console_connections — one row per website.
// ---------------------------------------------------------------------------

export async function getSearchConsoleConnection(websiteId: string): Promise<ConnectionRow | null> {
  const db = supabaseAdmin();
  const { data, error } = await db.from("search_console_connections").select("*").eq("website_id", websiteId).maybeSingle();
  if (error) throw error;
  return data;
}

/** Creates or replaces the connection after a successful OAuth code exchange.
 * Starts in 'pending_site_selection' — the admin still has to pick which GSC
 * property maps to this website (a Google account can have several). */
export async function upsertConnectionAfterAuth(input: {
  organizationId: string;
  websiteId: string;
  refreshToken: string;
  accessToken: string;
  accessTokenExpiresAt: string;
  scope: string;
}): Promise<ConnectionRow> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("search_console_connections")
    .upsert(
      {
        organization_id: input.organizationId,
        website_id: input.websiteId,
        refresh_token: input.refreshToken,
        access_token: input.accessToken,
        access_token_expires_at: input.accessTokenExpiresAt,
        scope: input.scope,
        status: "pending_site_selection",
        site_url: null,
        last_sync_error: null,
      },
      { onConflict: "website_id" }
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Records the GSC property the admin picked in the site-picker step and
 * marks the connection ready to sync. */
export async function selectSearchConsoleSite(websiteId: string, siteUrl: string): Promise<ConnectionRow> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("search_console_connections")
    .update({ site_url: siteUrl, status: "active", last_sync_error: null })
    .eq("website_id", websiteId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateConnectionAccessToken(websiteId: string, accessToken: string, accessTokenExpiresAt: string): Promise<void> {
  const db = supabaseAdmin();
  const { error } = await db
    .from("search_console_connections")
    .update({ access_token: accessToken, access_token_expires_at: accessTokenExpiresAt })
    .eq("website_id", websiteId);
  if (error) throw error;
}

export async function markConnectionStatus(websiteId: string, status: SearchConsoleConnectionStatus, lastSyncError: string | null = null): Promise<void> {
  const db = supabaseAdmin();
  const { error } = await db.from("search_console_connections").update({ status, last_sync_error: lastSyncError }).eq("website_id", websiteId);
  if (error) throw error;
}

export async function disconnectSearchConsole(websiteId: string): Promise<void> {
  const db = supabaseAdmin();
  const { error } = await db.from("search_console_connections").delete().eq("website_id", websiteId);
  if (error) throw error;
}

/** Active websites with an 'active' Search Console connection — the set the
 * scheduler's due-enqueue phase checks, kept separate from
 * lib/db/websites.ts's listActiveWebsites() since most websites won't have
 * one connected. */
export async function listActiveWebsitesWithSearchConsoleConnection(): Promise<WebsiteRow[]> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("websites")
    .select("*, search_console_connections!inner(status)")
    .eq("status", "active")
    .eq("search_console_connections.status", "active");
  if (error) throw error;
  return data.map(({ search_console_connections, ...rest }) => rest) as WebsiteRow[];
}

// ---------------------------------------------------------------------------
// search_console_metrics — actual Google data only. Upserted on
// (website_id, date, query, page_url) so re-syncing overlapping date ranges
// never duplicates rows.
// ---------------------------------------------------------------------------

export async function upsertSearchConsoleMetrics(
  organizationId: string,
  websiteId: string,
  rows: NormalizedSearchConsoleMetric[]
): Promise<number> {
  if (rows.length === 0) return 0;
  const db = supabaseAdmin();
  const { error } = await db.from("search_console_metrics").upsert(
    rows.map((row) => ({
      organization_id: organizationId,
      website_id: websiteId,
      date: row.date,
      query: row.query,
      page_url: row.page_url,
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position,
    })),
    { onConflict: "website_id,date,query,page_url" }
  );
  if (error) throw error;
  return rows.length;
}

/** All rows for a website within a date range (inclusive) — the raw input
 * lib/search-performance/comparison.ts aggregates/compares. Not limited by
 * row count since a comparison window is already bounded by days, not rows. */
export async function listSearchConsoleMetricsForWebsiteInRange(websiteId: string, startDate: string, endDate: string): Promise<MetricRow[]> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("search_console_metrics")
    .select("*")
    .eq("website_id", websiteId)
    .gte("date", startDate)
    .lte("date", endDate);
  if (error) throw error;
  return data;
}

export async function listSearchConsoleMetricsForWebsite(websiteId: string, limit = 100): Promise<MetricRow[]> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("search_console_metrics")
    .select("*")
    .eq("website_id", websiteId)
    .order("date", { ascending: false })
    .order("clicks", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

export interface SearchConsoleStats {
  totalRows: number;
  totalClicks: number;
  totalImpressions: number;
  averagePosition: number | null;
  earliestDate: string | null;
  latestDate: string | null;
}

export async function getSearchConsoleStatsForWebsite(websiteId: string): Promise<SearchConsoleStats> {
  const db = supabaseAdmin();
  const { data, error } = await db.from("search_console_metrics").select("clicks, impressions, position, date").eq("website_id", websiteId);
  if (error) throw error;

  if (data.length === 0) {
    return { totalRows: 0, totalClicks: 0, totalImpressions: 0, averagePosition: null, earliestDate: null, latestDate: null };
  }

  let totalClicks = 0;
  let totalImpressions = 0;
  let positionSum = 0;
  let positionCount = 0;
  let earliestDate = data[0]!.date;
  let latestDate = data[0]!.date;
  for (const row of data) {
    totalClicks += row.clicks;
    totalImpressions += row.impressions;
    if (row.position !== null) {
      positionSum += row.position;
      positionCount++;
    }
    if (row.date < earliestDate) earliestDate = row.date;
    if (row.date > latestDate) latestDate = row.date;
  }

  return {
    totalRows: data.length,
    totalClicks,
    totalImpressions,
    averagePosition: positionCount > 0 ? Math.round((positionSum / positionCount) * 100) / 100 : null,
    earliestDate,
    latestDate,
  };
}
