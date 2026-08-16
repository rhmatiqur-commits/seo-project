import { supabaseAdmin } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type AuditRow = Database["public"]["Tables"]["publication_audit_log"]["Row"];

/** `actor` is always a constant placeholder today — there is no per-user
 * auth system yet (see SECURITY_AUDIT.md's documented, deferred
 * limitation); this records the shared-operator identity honestly rather
 * than fabricating a per-user one. Ready for real identity once it exists. */
const DEFAULT_ACTOR = "admin";

export interface RecordAuditEventInput {
  organizationId: string;
  websiteId: string;
  contentPublicationId?: string | null;
  contentVersionId: string;
  action: string;
  targetUrl?: string | null;
  result?: string | null;
  failureReason?: string | null;
  actor?: string;
}

export async function recordPublicationAuditEvent(input: RecordAuditEventInput): Promise<AuditRow> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("publication_audit_log")
    .insert({
      organization_id: input.organizationId,
      website_id: input.websiteId,
      content_publication_id: input.contentPublicationId ?? null,
      content_version_id: input.contentVersionId,
      action: input.action,
      actor: input.actor ?? DEFAULT_ACTOR,
      target_url: input.targetUrl ?? null,
      result: input.result ?? null,
      failure_reason: input.failureReason ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function listAuditEventsForVersion(contentVersionId: string): Promise<AuditRow[]> {
  const db = supabaseAdmin();
  const { data, error } = await db.from("publication_audit_log").select("*").eq("content_version_id", contentVersionId).order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}
