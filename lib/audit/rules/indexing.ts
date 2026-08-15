import type { AuditRule, IssueDraft } from "@/lib/audit/types";

export const noindexRule: AuditRule = ({ pages }) => {
  const issues: IssueDraft[] = [];
  for (const page of pages) {
    if (page.is_noindex) {
      issues.push({
        page_id: page.id,
        issue_type: "NOINDEX_PAGE",
        category: "indexing",
        severity: "medium",
        title: "Page is set to noindex",
        description: `${page.url} has a noindex directive, so it will not appear in search results.`,
        recommended_action: "Confirm this is intentional; remove the noindex directive if the page should be indexed.",
        detected_data: { url: page.url },
      });
    }
  }
  return issues;
};

export const canonicalRule: AuditRule = ({ pages }) => {
  const issues: IssueDraft[] = [];
  const byUrl = new Map(pages.map((p) => [p.url, p]));

  for (const page of pages) {
    if (!page.canonical_url) continue;
    if (page.canonical_url !== page.url) {
      const target = byUrl.get(page.canonical_url);
      if (!target) {
        // Canonical points somewhere outside the crawled set — not necessarily wrong
        // (could be a cross-domain canonical), but worth a low-severity flag.
        issues.push({
          page_id: page.id,
          issue_type: "CANONICAL_POINTS_OUTSIDE_CRAWL",
          category: "indexing",
          severity: "low",
          title: "Canonical URL points outside the crawled site",
          description: `${page.url} canonicalizes to ${page.canonical_url}, which wasn't found during the crawl.`,
          recommended_action: "Verify the canonical target is correct and resolves successfully.",
          detected_data: { url: page.url, canonical_url: page.canonical_url },
        });
      } else if (target.http_status && target.http_status >= 400) {
        issues.push({
          page_id: page.id,
          issue_type: "CANONICAL_TARGET_BROKEN",
          category: "indexing",
          severity: "high",
          title: "Canonical URL points to a broken page",
          description: `${page.url} canonicalizes to ${page.canonical_url}, which returns HTTP ${target.http_status}.`,
          recommended_action: "Point the canonical tag at a live, indexable page.",
          detected_data: { url: page.url, canonical_url: page.canonical_url, target_status: target.http_status },
        });
      }
    }
  }

  // Multiple distinct pages canonicalizing to the same target is normal (that's the point
  // of canonicalization) — so we don't flag it. What IS worth flagging: a page whose
  // canonical creates a chain (A -> B -> C) rather than pointing straight at the final target.
  for (const page of pages) {
    if (!page.canonical_url || page.canonical_url === page.url) continue;
    const target = byUrl.get(page.canonical_url);
    if (target?.canonical_url && target.canonical_url !== target.url) {
      issues.push({
        page_id: page.id,
        issue_type: "CANONICAL_CHAIN",
        category: "indexing",
        severity: "low",
        title: "Canonical chain detected",
        description: `${page.url} canonicalizes to ${page.canonical_url}, which itself canonicalizes elsewhere instead of being the final target.`,
        recommended_action: "Point the canonical tag directly at the final destination page.",
        detected_data: { url: page.url, chain: [page.url, page.canonical_url, target.canonical_url] },
      });
    }
  }

  return issues;
};

export const redirectChainRule: AuditRule = ({ pages }) => {
  const issues: IssueDraft[] = [];
  for (const page of pages) {
    const chain = page.redirect_chain;
    if (chain && chain.length > 0) {
      issues.push({
        page_id: page.id,
        issue_type: chain.length > 1 ? "REDIRECT_CHAIN" : "SINGLE_REDIRECT",
        category: "technical",
        severity: chain.length > 1 ? "medium" : "low",
        title: chain.length > 1 ? "Redirect chain detected" : "Page is redirected",
        description: `${chain.map((h) => h.url).join(" -> ")} -> ${page.url} (${chain.length} hop${chain.length > 1 ? "s" : ""}).`,
        recommended_action: "Point the original link/reference directly at the final URL to avoid unnecessary redirect hops.",
        detected_data: { final_url: page.url, chain },
      });
    }
  }
  return issues;
};

export const httpsRule: AuditRule = ({ pages }) => {
  const issues: IssueDraft[] = [];
  for (const page of pages) {
    if (page.url.startsWith("http://")) {
      issues.push({
        page_id: page.id,
        issue_type: "INSECURE_HTTP_URL",
        category: "technical",
        severity: "high",
        title: "Page served over HTTP, not HTTPS",
        description: `${page.url} is not served over HTTPS.`,
        recommended_action: "Serve the site over HTTPS and redirect all HTTP traffic to HTTPS.",
        detected_data: { url: page.url },
      });
    }
  }
  return issues;
};
