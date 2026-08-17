import { supabaseAdmin } from "@/lib/supabase/server";
import type { Database, GithubPublicationMode } from "@/lib/supabase/types";

type CmsConnectionRow = Database["public"]["Tables"]["cms_connections"]["Row"];

export async function getCmsConnectionForWebsite(websiteId: string): Promise<CmsConnectionRow | null> {
  const db = supabaseAdmin();
  const { data, error } = await db.from("cms_connections").select("*").eq("website_id", websiteId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function getCmsConnectionById(id: string): Promise<CmsConnectionRow | null> {
  const db = supabaseAdmin();
  const { data, error } = await db.from("cms_connections").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

export interface UpsertCmsConnectionInput {
  organizationId: string;
  websiteId: string;
  baseUrl: string;
  username: string;
  applicationPassword: string;
}

/**
 * Creates the connection (and its encrypted credential in Supabase Vault,
 * via the cms_credential_* RPCs — see migration 0018) if none exists for
 * this website yet, or updates both in place if one does — mirrors
 * search_console_connections' one-per-website upsert pattern. Any
 * credential change resets status to 'pending': a connection is never
 * trusted as 'active' again until explicitly re-tested (testCmsConnection
 * in lib/jobs/... / app/admin/actions.ts).
 */
export async function upsertCmsConnection(input: UpsertCmsConnectionInput): Promise<CmsConnectionRow> {
  const db = supabaseAdmin();
  const existing = await getCmsConnectionForWebsite(input.websiteId);

  if (existing) {
    const { error: credError } = await db.rpc("cms_credential_update", { p_id: existing.credential_secret_id, p_secret: input.applicationPassword });
    if (credError) throw credError;
    const { data, error } = await db
      .from("cms_connections")
      .update({ base_url: input.baseUrl, username: input.username, status: "pending", last_test_error: null })
      .eq("id", existing.id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  const { data: secretId, error: createError } = await db.rpc("cms_credential_create", {
    p_secret: input.applicationPassword,
    p_description: `WordPress Application Password for website ${input.websiteId}`,
  });
  if (createError) throw createError;

  const { data, error } = await db
    .from("cms_connections")
    .insert({
      organization_id: input.organizationId,
      website_id: input.websiteId,
      provider: "wordpress",
      base_url: input.baseUrl,
      username: input.username,
      credential_secret_id: secretId as unknown as string,
      status: "pending",
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------------
// GitHub connections (Phase 6A) — same cms_connections table, same
// credential_secret_id / Vault mechanism as WordPress above ("extend the
// existing CMS/publishing connection architecture rather than creating an
// unrelated system", per spec). Two-step flow, mirroring
// search_console_connections' pending_site_selection -> site-picker ->
// active pattern exactly: save the token first (status
// 'pending_repo_selection'), then let the admin pick a repository from a
// live-listed set (app/admin/actions.ts's listGitHubRepositoriesAction)
// before publishing can begin.
// ---------------------------------------------------------------------------

export interface UpsertGitHubTokenInput {
  organizationId: string;
  websiteId: string;
  token: string;
}

/** Step 1: save the token (encrypted, same Vault RPCs as WordPress's
 * Application Password). Resets any previously-selected repository — a new
 * token might belong to a different account with access to different
 * repositories, so an old owner/repo selection can't be trusted to still be
 * valid. */
export async function upsertGitHubToken(input: UpsertGitHubTokenInput): Promise<CmsConnectionRow> {
  const db = supabaseAdmin();
  const existing = await getCmsConnectionForWebsite(input.websiteId);

  if (existing) {
    const { error: credError } = await db.rpc("cms_credential_update", { p_id: existing.credential_secret_id, p_secret: input.token });
    if (credError) throw credError;
    const { data, error } = await db
      .from("cms_connections")
      .update({
        provider: "github",
        status: "pending_repo_selection",
        last_test_error: null,
        github_owner: null,
        github_repo: null,
        github_production_branch: null,
        github_account_login: null,
      })
      .eq("id", existing.id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  const { data: secretId, error: createError } = await db.rpc("cms_credential_create", {
    p_secret: input.token,
    p_description: `GitHub token for website ${input.websiteId}`,
  });
  if (createError) throw createError;

  const { data, error } = await db
    .from("cms_connections")
    .insert({
      organization_id: input.organizationId,
      website_id: input.websiteId,
      provider: "github",
      credential_secret_id: secretId as unknown as string,
      status: "pending_repo_selection",
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export interface SelectGitHubRepositoryInput {
  websiteId: string;
  owner: string;
  repo: string;
  productionBranch: string;
  publicationMode: GithubPublicationMode;
  accountLogin: string;
}

/** Step 2: the admin's repository/branch/mode choice, from a live-listed set
 * (never a manually-typed URL — spec: "do not require the user to manually
 * enter a repository URL if the GitHub API can provide it"). Moves the
 * connection to 'pending' — same as WordPress's initial state — requiring
 * an explicit Test Connection click before it's trusted as 'active'. */
export async function selectGitHubRepository(input: SelectGitHubRepositoryInput): Promise<CmsConnectionRow> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("cms_connections")
    .update({
      github_owner: input.owner,
      github_repo: input.repo,
      github_production_branch: input.productionBranch,
      github_publication_mode: input.publicationMode,
      github_account_login: input.accountLogin,
      status: "pending",
      last_test_error: null,
    })
    .eq("website_id", input.websiteId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function markConnectionTested(id: string, ok: boolean, testError: string | null): Promise<CmsConnectionRow> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("cms_connections")
    .update({ status: ok ? "active" : "error", last_tested_at: new Date().toISOString(), last_test_error: testError })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Decrypts and returns the raw secret — a WordPress Application Password or
 * a GitHub token, whichever this connection actually stores (the RPC itself
 * has no notion of "which provider", it just decrypts a Vault secret by id).
 * Only ever called server-side, immediately before a provider API call (see
 * lib/jobs/handlers/create-draft.ts / publish-content.ts / merge-to-production.ts),
 * never returned toward the client, never logged — the caller must not
 * console.log the result or include it in any thrown error message.
 */
export async function getDecryptedCredential(secretId: string): Promise<string> {
  const db = supabaseAdmin();
  const { data, error } = await db.rpc("cms_credential_read", { p_id: secretId });
  if (error) throw error;
  if (!data) throw new Error("Stored credential could not be decrypted — the connection may need to be re-created.");
  return data;
}
