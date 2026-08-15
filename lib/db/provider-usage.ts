import { supabaseAdmin } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type ProviderUsageRow = Database["public"]["Tables"]["provider_usage"]["Row"];

/** Not a billing system — a log of what was called, how much, and a
 * documented estimated cost (see lib/serp/limits.ts's
 * DATAFORSEO_SERP_COST_ESTIMATE_USD), the foundation for a future cost
 * dashboard. */
export async function logProviderUsage(input: {
  organizationId: string;
  websiteId: string | null;
  provider: string;
  operation: string;
  units?: number;
  estimatedCostUsd?: number | null;
}): Promise<void> {
  const db = supabaseAdmin();
  const { error } = await db.from("provider_usage").insert({
    organization_id: input.organizationId,
    website_id: input.websiteId,
    provider: input.provider,
    operation: input.operation,
    units: input.units ?? 1,
    estimated_cost_usd: input.estimatedCostUsd ?? null,
  });
  if (error) throw error;
}

export interface ProviderUsageSummary {
  totalUnits: number;
  totalEstimatedCostUsd: number;
  byOperation: Record<string, { units: number; estimatedCostUsd: number }>;
}

export async function getProviderUsageSummaryForWebsite(websiteId: string, sinceDaysAgo = 30): Promise<ProviderUsageSummary> {
  const db = supabaseAdmin();
  const since = new Date(Date.now() - sinceDaysAgo * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await db.from("provider_usage").select("operation, units, estimated_cost_usd").eq("website_id", websiteId).gte("created_at", since);
  if (error) throw error;

  let totalUnits = 0;
  let totalEstimatedCostUsd = 0;
  const byOperation: Record<string, { units: number; estimatedCostUsd: number }> = {};
  for (const row of data) {
    totalUnits += row.units;
    totalEstimatedCostUsd += row.estimated_cost_usd ?? 0;
    const bucket = (byOperation[row.operation] ??= { units: 0, estimatedCostUsd: 0 });
    bucket.units += row.units;
    bucket.estimatedCostUsd += row.estimated_cost_usd ?? 0;
  }

  return { totalUnits, totalEstimatedCostUsd: Math.round(totalEstimatedCostUsd * 10000) / 10000, byOperation };
}

export async function listRecentProviderUsageForWebsite(websiteId: string, limit = 20): Promise<ProviderUsageRow[]> {
  const db = supabaseAdmin();
  const { data, error } = await db.from("provider_usage").select("*").eq("website_id", websiteId).order("created_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return data;
}
