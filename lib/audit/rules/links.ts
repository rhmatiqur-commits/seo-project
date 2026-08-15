import type { AuditRule, IssueDraft } from "@/lib/audit/types";

export const brokenPagesRule: AuditRule = ({ pages }) => {
  const issues: IssueDraft[] = [];
  for (const page of pages) {
    if (page.http_status !== null && page.http_status >= 400) {
      issues.push({
        page_id: page.id,
        issue_type: "BROKEN_PAGE",
        category: "technical",
        severity: page.http_status >= 500 ? "critical" : "high",
        title: `Page returns HTTP ${page.http_status}`,
        description: `${page.url} returned status ${page.http_status} during the crawl.`,
        recommended_action:
          page.http_status === 404
            ? "Fix the broken URL, restore the page, or set up a redirect to a relevant live page."
            : "Investigate the server error and fix the underlying cause.",
        detected_data: { url: page.url, status: page.http_status },
      });
    }
  }
  return issues;
};

export const brokenInternalLinksRule: AuditRule = ({ pages, links }) => {
  const issues: IssueDraft[] = [];
  const statusByPageId = new Map(pages.map((p) => [p.id, p.http_status]));
  const pageById = new Map(pages.map((p) => [p.id, p]));

  for (const link of links) {
    if (!link.is_internal || !link.target_page_id) continue;
    const targetStatus = statusByPageId.get(link.target_page_id);
    if (targetStatus !== null && targetStatus !== undefined && targetStatus >= 400) {
      const sourcePage = pageById.get(link.source_page_id);
      issues.push({
        page_id: link.source_page_id,
        issue_type: "BROKEN_INTERNAL_LINK",
        category: "links",
        severity: "medium",
        title: "Broken internal link",
        description: `${sourcePage?.url ?? link.source_page_id} links to ${link.target_url}, which returns HTTP ${targetStatus}.`,
        recommended_action: "Update or remove the link, or fix/redirect the target page.",
        detected_data: { source_url: sourcePage?.url, target_url: link.target_url, target_status: targetStatus },
      });
    }
  }
  return issues;
};

export const orphanPagesRule: AuditRule = ({ pages }) => {
  const issues: IssueDraft[] = [];
  for (const page of pages) {
    if (page.is_orphan) {
      issues.push({
        page_id: page.id,
        issue_type: "ORPHAN_PAGE",
        category: "links",
        severity: "medium",
        title: "Orphan page (no internal links found to it)",
        description: `${page.url} was reached during the crawl but has no discovered internal links pointing to it.`,
        recommended_action: "Add internal links from relevant pages so users and search engines can discover it through site navigation.",
        detected_data: { url: page.url },
      });
    }
  }
  return issues;
};

export const pageDepthRule: AuditRule = ({ pages }) => {
  const issues: IssueDraft[] = [];
  const DEEP_THRESHOLD = 4;
  for (const page of pages) {
    if (page.depth !== null && page.depth > DEEP_THRESHOLD) {
      issues.push({
        page_id: page.id,
        issue_type: "EXCESSIVE_PAGE_DEPTH",
        category: "links",
        severity: "low",
        title: "Page is buried deep in the site structure",
        description: `${page.url} is ${page.depth} clicks from the homepage.`,
        recommended_action: "Consider surfacing important pages closer to the homepage via navigation or internal linking.",
        detected_data: { url: page.url, depth: page.depth },
      });
    }
  }
  return issues;
};
