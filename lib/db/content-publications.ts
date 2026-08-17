import { supabaseAdmin } from "@/lib/supabase/server";
import { jsonb, type Database, type PublicationStatus } from "@/lib/supabase/types";

type ContentPublicationRow = Database["public"]["Tables"]["content_publications"]["Row"];

/** One row per content_version's publication *lineage* — created once,
 * updated in place across every subsequent draft/publish/retry attempt, so
 * an external_id learned on attempt 1 is what attempt 2 sees (the
 * duplicate-prevention mechanism — see lib/publishing/retry-strategy.ts). */
export async function getPublicationForVersion(contentVersionId: string): Promise<ContentPublicationRow | null> {
  const db = supabaseAdmin();
  const { data, error } = await db.from("content_publications").select("*").eq("content_version_id", contentVersionId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function getPublication(id: string): Promise<ContentPublicationRow | null> {
  const db = supabaseAdmin();
  const { data, error } = await db.from("content_publications").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

export interface InsertPublicationInput {
  organizationId: string;
  websiteId: string;
  contentVersionId: string;
  publicationType: "CREATE_NEW_PAGE" | "OPTIMISE_EXISTING_PAGE";
  targetUrl: string | null;
}

export async function insertPublication(input: InsertPublicationInput): Promise<ContentPublicationRow> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("content_publications")
    .insert({
      organization_id: input.organizationId,
      website_id: input.websiteId,
      content_version_id: input.contentVersionId,
      provider: "wordpress",
      publication_type: input.publicationType,
      target_url: input.targetUrl,
      status: "PENDING",
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export interface UpdatePublicationPatch {
  externalId?: string | null;
  targetUrl?: string | null;
  publishedAt?: string | null;
  error?: string | null;
  providerResponseMetadata?: Record<string, unknown>;
  // Phase 6A: GitHub/Vercel git-flow identifiers — all optional/undefined
  // for a WordPress-provider row, which never sets any of these.
  branchName?: string | null;
  baseCommitSha?: string | null;
  commitSha?: string | null;
  pullRequestNumber?: number | null;
  pullRequestUrl?: string | null;
  previewUrl?: string | null;
  productionCommitSha?: string | null;
}

export async function updatePublicationStatus(id: string, status: PublicationStatus, patch: UpdatePublicationPatch = {}): Promise<ContentPublicationRow> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("content_publications")
    .update({
      status,
      ...(patch.externalId !== undefined ? { external_id: patch.externalId } : {}),
      ...(patch.targetUrl !== undefined ? { target_url: patch.targetUrl } : {}),
      ...(patch.publishedAt !== undefined ? { published_at: patch.publishedAt } : {}),
      ...(patch.error !== undefined ? { error: patch.error } : {}),
      ...(patch.providerResponseMetadata !== undefined ? { provider_response_metadata: jsonb(patch.providerResponseMetadata) } : {}),
      ...(patch.branchName !== undefined ? { branch_name: patch.branchName } : {}),
      ...(patch.baseCommitSha !== undefined ? { base_commit_sha: patch.baseCommitSha } : {}),
      ...(patch.commitSha !== undefined ? { commit_sha: patch.commitSha } : {}),
      ...(patch.pullRequestNumber !== undefined ? { pull_request_number: patch.pullRequestNumber } : {}),
      ...(patch.pullRequestUrl !== undefined ? { pull_request_url: patch.pullRequestUrl } : {}),
      ...(patch.previewUrl !== undefined ? { preview_url: patch.previewUrl } : {}),
      ...(patch.productionCommitSha !== undefined ? { production_commit_sha: patch.productionCommitSha } : {}),
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Get-or-create — content_publications is one row per content_version's
 * publication lineage (see getPublicationForVersion's own comment); this is
 * what every publish/create-draft entry point (API route + admin actions)
 * calls so they never accidentally create two lineages for the same version. */
export async function getOrCreatePublicationForVersion(input: InsertPublicationInput): Promise<ContentPublicationRow> {
  const existing = await getPublicationForVersion(input.contentVersionId);
  if (existing) return existing;
  return insertPublication(input);
}

export async function listPublicationsForWebsite(websiteId: string, limit = 50): Promise<ContentPublicationRow[]> {
  const db = supabaseAdmin();
  const { data, error } = await db.from("content_publications").select("*").eq("website_id", websiteId).order("updated_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return data;
}
