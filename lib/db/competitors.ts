import { supabaseAdmin } from "@/lib/supabase/server";
import { jsonb, type Database, type CompetitorClassification, type JobStatus, type Heading } from "@/lib/supabase/types";

type CompetitorDomainRow = Database["public"]["Tables"]["competitor_domains"]["Row"];
type CompetitorPageRow = Database["public"]["Tables"]["competitor_pages"]["Row"];

// ---------------------------------------------------------------------------
// Raw competitor signal rows — fed into lib/serp/aggregate-competitors.ts's
// pure aggregation. Kept as a plain query (no business logic) so the
// aggregation math stays testable without a DB.
// ---------------------------------------------------------------------------

export interface RawCompetitorResultRow {
  domain: string;
  url: string;
  keyword_id: string | null;
  position: number;
}

/** Every non-client serp_results row for a website, joined through
 * serp_runs. The caller groups/filters by keyword before aggregating (only
 * the top few positions per keyword are a meaningful competitive signal). */
export async function listCompetitorResultsForWebsite(websiteId: string): Promise<RawCompetitorResultRow[]> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("serp_results")
    .select("domain, url, position, serp_runs!inner(website_id, keyword_id)")
    .eq("serp_runs.website_id", websiteId)
    .eq("is_client_domain", false);
  if (error) throw error;
  return (data as unknown as Array<{ domain: string; url: string; position: number; serp_runs: { keyword_id: string | null } }>).map((row) => ({
    domain: row.domain,
    url: row.url,
    keyword_id: row.serp_runs.keyword_id,
    position: row.position,
  }));
}

// ---------------------------------------------------------------------------
// competitor_domains
// ---------------------------------------------------------------------------

export interface UpsertCompetitorDomainInput {
  organizationId: string;
  websiteId: string;
  domain: string;
  classification: CompetitorClassification;
  appearances: number;
  averagePosition: number | null;
  relevantKeywordCount: number;
  relevanceScore: number;
}

export async function upsertCompetitorDomain(input: UpsertCompetitorDomainInput): Promise<CompetitorDomainRow> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("competitor_domains")
    .upsert(
      {
        organization_id: input.organizationId,
        website_id: input.websiteId,
        domain: input.domain,
        classification: input.classification,
        appearances: input.appearances,
        average_position: input.averagePosition,
        relevant_keyword_count: input.relevantKeywordCount,
        relevance_score: input.relevanceScore,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "website_id,domain" }
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function listCompetitorDomainsForWebsite(websiteId: string): Promise<CompetitorDomainRow[]> {
  const db = supabaseAdmin();
  const { data, error } = await db.from("competitor_domains").select("*").eq("website_id", websiteId).order("relevance_score", { ascending: false, nullsFirst: false });
  if (error) throw error;
  return data;
}

export async function getCompetitorDomainById(id: string): Promise<CompetitorDomainRow | null> {
  const db = supabaseAdmin();
  const { data, error } = await db.from("competitor_domains").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------------
// competitor_pages — structured metadata only, never body text/raw HTML.
// ---------------------------------------------------------------------------

export interface UpsertCompetitorPageInput {
  competitorDomainId: string;
  url: string;
  title: string | null;
  metaDescription: string | null;
  h1: string | null;
  headings: Heading[];
  wordCount: number | null;
  hasStructuredData: boolean;
  structuredDataTypes: string[];
  majorTopics: string[];
  crawlStatus: JobStatus;
}

export async function upsertCompetitorPage(input: UpsertCompetitorPageInput): Promise<CompetitorPageRow> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("competitor_pages")
    .upsert(
      {
        competitor_domain_id: input.competitorDomainId,
        url: input.url,
        title: input.title,
        meta_description: input.metaDescription,
        h1: input.h1,
        headings: jsonb(input.headings),
        word_count: input.wordCount,
        has_structured_data: input.hasStructuredData,
        structured_data_types: input.structuredDataTypes,
        major_topics: input.majorTopics,
        crawl_status: input.crawlStatus,
        last_crawled_at: input.crawlStatus === "COMPLETED" ? new Date().toISOString() : null,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "competitor_domain_id,url" }
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function listCompetitorPagesForWebsite(websiteId: string): Promise<CompetitorPageRow[]> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("competitor_pages")
    .select("*, competitor_domains!inner(website_id)")
    .eq("competitor_domains.website_id", websiteId);
  if (error) throw error;
  return (data as unknown as (CompetitorPageRow & { competitor_domains: unknown })[]).map(({ competitor_domains, ...rest }) => rest as CompetitorPageRow);
}
