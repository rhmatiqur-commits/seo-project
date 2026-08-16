import { supabaseAdmin } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

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
 * Decrypts and returns the raw Application Password. Only ever called
 * server-side, immediately before a WordPress API call (see
 * lib/jobs/handlers/create-draft.ts / publish-content.ts), never returned
 * toward the client, never logged — the caller must not console.log the
 * result or include it in any thrown error message.
 */
export async function getDecryptedCredential(secretId: string): Promise<string> {
  const db = supabaseAdmin();
  const { data, error } = await db.rpc("cms_credential_read", { p_id: secretId });
  if (error) throw error;
  if (!data) throw new Error("Stored WordPress credential could not be decrypted — the connection may need to be re-created.");
  return data;
}
