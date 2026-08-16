import type { ContentPipelineStatus } from "@/lib/supabase/types";

/**
 * The one non-negotiable gate in this whole phase: content may only be
 * published when its content_jobs.status is APPROVED. Every publish path —
 * admin action, API route, and the job handler itself — calls this against
 * a value re-fetched from the database, never a value trusted from the
 * browser (see lib/jobs/handlers/create-draft.ts / publish-content.ts).
 */
export function isContentApprovedForPublication(status: ContentPipelineStatus): boolean {
  return status === "APPROVED";
}
