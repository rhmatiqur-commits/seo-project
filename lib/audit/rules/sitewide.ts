import type { AuditRule, IssueDraft } from "@/lib/audit/types";

/** Sitewide checks that aren't tied to a single page (page_id stays null). */
export const sitewideRule: AuditRule = ({ website }) => {
  const issues: IssueDraft[] = [];

  if (website.robots_txt_available === false) {
    issues.push({
      page_id: null,
      issue_type: "ROBOTS_TXT_MISSING",
      category: "technical",
      severity: "medium",
      title: "robots.txt not found",
      description: `No robots.txt was found at ${website.base_url}/robots.txt.`,
      recommended_action: "Add a robots.txt file to control crawler access and reference the sitemap.",
      detected_data: { base_url: website.base_url },
    });
  }

  if (website.sitemap_available === false) {
    issues.push({
      page_id: null,
      issue_type: "SITEMAP_MISSING",
      category: "technical",
      severity: "medium",
      title: "XML sitemap not found",
      description: `No sitemap was found via robots.txt or at ${website.base_url}/sitemap.xml.`,
      recommended_action: "Publish an XML sitemap and reference it from robots.txt to help search engines discover all pages.",
      detected_data: { base_url: website.base_url },
    });
  }

  return issues;
};
