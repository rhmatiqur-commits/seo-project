import type { AuditRule, IssueDraft } from "@/lib/audit/types";

const TITLE_MIN = 15;
const TITLE_MAX = 60;
const DESCRIPTION_MIN = 50;
const DESCRIPTION_MAX = 160;
const THIN_CONTENT_WORDS = 200;

/** HTML pages only — skip non-HTML responses (no title/meta to check) and pages that failed to load. */
function htmlPages(pages: Parameters<AuditRule>[0]["pages"]) {
  return pages.filter((p) => p.http_status !== null && p.http_status >= 200 && p.http_status < 300 && p.title !== undefined);
}

export const titleRules: AuditRule = ({ pages }) => {
  const issues: IssueDraft[] = [];
  const ok = htmlPages(pages).filter((p) => p.crawled_at); // only pages we actually parsed

  const byTitle = new Map<string, typeof ok>();
  for (const page of ok) {
    if (!page.title) continue;
    const key = page.title.trim().toLowerCase();
    if (!byTitle.has(key)) byTitle.set(key, []);
    byTitle.get(key)!.push(page);
  }

  for (const page of ok) {
    if (!page.title || !page.title.trim()) {
      issues.push({
        page_id: page.id,
        issue_type: "MISSING_TITLE",
        category: "content",
        severity: "high",
        title: "Missing page title",
        description: `${page.url} has no <title> tag.`,
        recommended_action: "Add a unique, descriptive <title> (roughly 15-60 characters) that reflects the page's search intent.",
        detected_data: { url: page.url },
      });
      continue;
    }
    const len = page.title.trim().length;
    if (len > TITLE_MAX) {
      issues.push({
        page_id: page.id,
        issue_type: "TITLE_TOO_LONG",
        category: "content",
        severity: "low",
        title: "Title tag too long",
        description: `Title is ${len} characters; it will likely be truncated in search results.`,
        recommended_action: `Shorten the title to under ${TITLE_MAX} characters while keeping the primary keyword near the front.`,
        detected_data: { url: page.url, length: len, title: page.title },
      });
    } else if (len < TITLE_MIN) {
      issues.push({
        page_id: page.id,
        issue_type: "TITLE_TOO_SHORT",
        category: "content",
        severity: "low",
        title: "Title tag too short",
        description: `Title is only ${len} characters, which likely under-describes the page.`,
        recommended_action: `Expand the title to at least ${TITLE_MIN} characters with more specific, descriptive wording.`,
        detected_data: { url: page.url, length: len, title: page.title },
      });
    }
  }

  for (const [key, group] of byTitle) {
    if (key && group.length > 1) {
      issues.push({
        page_id: group[0]!.id,
        issue_type: "DUPLICATE_TITLE",
        category: "content",
        severity: "medium",
        title: "Duplicate title tag",
        description: `${group.length} pages share the title "${group[0]!.title}".`,
        recommended_action: "Give each page a unique title that reflects its specific content/intent.",
        detected_data: { urls: group.map((p) => p.url) },
      });
    }
  }

  return issues;
};

export const metaDescriptionRules: AuditRule = ({ pages }) => {
  const issues: IssueDraft[] = [];
  const ok = htmlPages(pages).filter((p) => p.crawled_at);

  const byDescription = new Map<string, typeof ok>();
  for (const page of ok) {
    if (!page.meta_description) continue;
    const key = page.meta_description.trim().toLowerCase();
    if (!byDescription.has(key)) byDescription.set(key, []);
    byDescription.get(key)!.push(page);
  }

  for (const page of ok) {
    if (!page.meta_description || !page.meta_description.trim()) {
      issues.push({
        page_id: page.id,
        issue_type: "MISSING_META_DESCRIPTION",
        category: "content",
        severity: "medium",
        title: "Missing meta description",
        description: `${page.url} has no meta description.`,
        recommended_action: `Add a compelling meta description (roughly ${DESCRIPTION_MIN}-${DESCRIPTION_MAX} characters) summarizing the page for search results.`,
        detected_data: { url: page.url },
      });
    }
  }

  for (const [key, group] of byDescription) {
    if (key && group.length > 1) {
      issues.push({
        page_id: group[0]!.id,
        issue_type: "DUPLICATE_META_DESCRIPTION",
        category: "content",
        severity: "low",
        title: "Duplicate meta description",
        description: `${group.length} pages share the same meta description.`,
        recommended_action: "Write a unique meta description per page.",
        detected_data: { urls: group.map((p) => p.url) },
      });
    }
  }

  return issues;
};

export const headingRules: AuditRule = ({ pages }) => {
  const issues: IssueDraft[] = [];
  for (const page of htmlPages(pages).filter((p) => p.crawled_at)) {
    const h1Count = page.headings.filter((h) => h.level === 1).length;
    if (h1Count === 0) {
      issues.push({
        page_id: page.id,
        issue_type: "MISSING_H1",
        category: "content",
        severity: "medium",
        title: "Missing H1",
        description: `${page.url} has no H1 heading.`,
        recommended_action: "Add a single H1 that clearly states the page's main topic.",
        detected_data: { url: page.url },
      });
    } else if (h1Count > 1) {
      issues.push({
        page_id: page.id,
        issue_type: "MULTIPLE_H1",
        category: "content",
        severity: "low",
        title: "Multiple H1 headings",
        description: `${page.url} has ${h1Count} H1 headings.`,
        recommended_action: "Use a single H1 per page; use H2/H3 for subsections.",
        detected_data: { url: page.url, count: h1Count },
      });
    }
  }
  return issues;
};

export const thinContentRule: AuditRule = ({ pages }) => {
  const issues: IssueDraft[] = [];
  for (const page of htmlPages(pages).filter((p) => p.crawled_at)) {
    if (page.word_count !== null && page.word_count < THIN_CONTENT_WORDS) {
      issues.push({
        page_id: page.id,
        issue_type: "THIN_CONTENT",
        category: "content",
        severity: "medium",
        title: "Thin content",
        description: `${page.url} has only ${page.word_count} words of body text.`,
        recommended_action: "Expand the page with substantive, useful content, or consolidate it with a related page if it doesn't warrant standalone content.",
        detected_data: { url: page.url, word_count: page.word_count },
      });
    }
  }
  return issues;
};

export const imageAltRule: AuditRule = ({ pages }) => {
  const issues: IssueDraft[] = [];
  for (const page of htmlPages(pages).filter((p) => p.crawled_at)) {
    if (page.images_missing_alt_count > 0) {
      issues.push({
        page_id: page.id,
        issue_type: "MISSING_IMAGE_ALT_TEXT",
        category: "content",
        severity: "low",
        title: "Images missing alt text",
        description: `${page.images_missing_alt_count} of ${page.images_count} images on ${page.url} have no alt text.`,
        recommended_action: "Add descriptive alt text to every meaningful image for accessibility and image search.",
        detected_data: { url: page.url, missing: page.images_missing_alt_count, total: page.images_count },
      });
    }
  }
  return issues;
};
