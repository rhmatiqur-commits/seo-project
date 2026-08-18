import { listWebsitesForOrganization } from "@/lib/db/websites";
import type { Database } from "@/lib/supabase/types";

type WebsiteRow = Database["public"]["Tables"]["websites"]["Row"];

/**
 * The client portal is website-scoped per page (opportunities, tasks,
 * content, etc. all belong to one website), but the spec's route structure
 * is organisation-scoped (`/dashboard/[orgSlug]/...`), and today every real
 * organisation in this platform has exactly one website (confirmed: CV
 * Central, Voltvid). Rather than build a full website-switcher UI for a
 * multi-website-per-org case that doesn't exist yet, every dashboard page
 * resolves "the" website via this one function — the org's first active
 * website, or its first website at all if none are active. Flagged in the
 * README as a placeholder decision, not a permanent architecture choice.
 */
export async function getPrimaryWebsiteForOrganization(organizationId: string): Promise<WebsiteRow | null> {
  const websites = await listWebsitesForOrganization(organizationId);
  if (websites.length === 0) return null;
  return websites.find((w) => w.status === "active") ?? websites[0]!;
}
