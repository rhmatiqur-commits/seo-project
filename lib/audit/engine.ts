import { titleRules, metaDescriptionRules, headingRules, thinContentRule, imageAltRule } from "@/lib/audit/rules/titles-and-meta";
import { brokenPagesRule, brokenInternalLinksRule, orphanPagesRule, pageDepthRule } from "@/lib/audit/rules/links";
import { noindexRule, canonicalRule, redirectChainRule, httpsRule } from "@/lib/audit/rules/indexing";
import { sitewideRule } from "@/lib/audit/rules/sitewide";
import type { AuditContext, AuditRule, IssueDraft } from "@/lib/audit/types";
import { createAudit, completeAudit, insertIssues } from "@/lib/db/audits";
import { listPagesForWebsite, listLinksForWebsite } from "@/lib/db/pages";
import type { Database } from "@/lib/supabase/types";

type WebsiteRow = Database["public"]["Tables"]["websites"]["Row"];

/**
 * All Phase 1 technical checks. These are necessary but not sufficient for
 * "complete SEO" — they cover crawlability/indexability/on-page basics only.
 * Off-page factors (backlinks, domain authority, real ranking data) are out
 * of scope until a keyword/ranking data provider is integrated.
 */
const RULES: AuditRule[] = [
  titleRules,
  metaDescriptionRules,
  headingRules,
  thinContentRule,
  imageAltRule,
  brokenPagesRule,
  brokenInternalLinksRule,
  orphanPagesRule,
  pageDepthRule,
  noindexRule,
  canonicalRule,
  redirectChainRule,
  httpsRule,
  sitewideRule,
];

export interface AuditRunResult {
  auditId: string;
  pagesAnalyzed: number;
  issuesFound: number;
  summary: {
    bySeverity: Record<string, number>;
    byCategory: Record<string, number>;
  };
}

export async function runSeoAudit(website: WebsiteRow, jobId: string | null): Promise<AuditRunResult> {
  const audit = await createAudit({
    website_id: website.id,
    job_id: jobId,
    status: "PROCESSING",
    started_at: new Date().toISOString(),
  });

  const [pages, links] = await Promise.all([listPagesForWebsite(website.id), listLinksForWebsite(website.id)]);
  const ctx: AuditContext = { website, pages, links };

  const drafts: IssueDraft[] = RULES.flatMap((rule) => rule(ctx));

  const bySeverity: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  for (const d of drafts) {
    bySeverity[d.severity] = (bySeverity[d.severity] ?? 0) + 1;
    byCategory[d.category] = (byCategory[d.category] ?? 0) + 1;
  }

  await insertIssues(
    drafts.map((d) => ({
      audit_id: audit.id,
      website_id: website.id,
      page_id: d.page_id,
      issue_type: d.issue_type,
      category: d.category,
      severity: d.severity,
      title: d.title,
      description: d.description,
      recommended_action: d.recommended_action,
      detected_data: d.detected_data,
    }))
  );

  await completeAudit(audit.id, {
    pages_analyzed: pages.length,
    issues_found: drafts.length,
    summary: { bySeverity, byCategory },
  });

  return { auditId: audit.id, pagesAnalyzed: pages.length, issuesFound: drafts.length, summary: { bySeverity, byCategory } };
}
