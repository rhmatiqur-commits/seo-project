import type { Database, IssueSeverity, WebsitePage } from "@/lib/supabase/types";

export type PageForAudit = WebsitePage;
export type LinkForAudit = Database["public"]["Tables"]["page_links"]["Row"];
export type WebsiteForAudit = Database["public"]["Tables"]["websites"]["Row"];

/** What a rule produces; the engine fills in audit_id/website_id before insert. */
export interface IssueDraft {
  page_id: string | null;
  issue_type: string;
  category: "content" | "technical" | "links" | "indexing";
  severity: IssueSeverity;
  title: string;
  description: string;
  recommended_action: string;
  detected_data: Record<string, unknown>;
}

export interface AuditContext {
  website: WebsiteForAudit;
  pages: PageForAudit[];
  links: LinkForAudit[];
}

export type AuditRule = (ctx: AuditContext) => IssueDraft[];
