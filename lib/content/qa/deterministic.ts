import { normalizeKeyword } from "@/lib/keywords/normalize";
import { validateInternalLinks } from "@/lib/content/qa/internal-links";
import {
  MIN_CONTENT_WORD_COUNT,
  MIN_PRIMARY_KEYWORD_OCCURRENCES,
  MAX_KEYWORD_DENSITY_PERCENT,
  MIN_SEO_TITLE_LENGTH,
  MAX_SEO_TITLE_LENGTH,
  MIN_META_DESCRIPTION_LENGTH,
  MAX_META_DESCRIPTION_LENGTH,
  MIN_HEADING_COUNT,
  MIN_TOPIC_COVERAGE_RATIO,
} from "@/lib/content/limits";
import type { ContentMetadata } from "@/lib/content/provider";
import type { ContentBrief } from "@/lib/content/brief-types";

export type CheckSeverity = "blocking" | "warning";

export interface DeterministicCheckResult {
  id: string;
  label: string;
  severity: CheckSeverity;
  passed: boolean;
  message: string;
}

export interface DeterministicQaInput {
  body: string;
  metadata: ContentMetadata;
  brief: ContentBrief;
  /** Every real page URL the body is allowed to link to (existing website_pages + the brief's own targetUrl). */
  knownPageUrls: string[];
}

// Regex list is intentionally simple/literal (not exhaustive NLP) — a
// best-effort deterministic safeguard, documented as such, not a claim of
// perfect placeholder detection.
const PLACEHOLDER_PATTERNS: RegExp[] = [
  /\[insert[^\]]*\]/i,
  /\btodo\b:?/i,
  /lorem ipsum/i,
  /as an ai (language model|assistant)/i,
  /\bxxx\b/i,
  /\bplaceholder\b/i,
  /\{\{[^}]*\}\}/, // unresolved template artifacts
  /\bTBD\b/,
  /\[your [a-z ]+\]/i,
];

// Heuristic patterns for claims that require real business facts to back
// them — only checked when the brief's missingBusinessInfo says those facts
// were never supplied, so a legitimately-sourced claim never trips this.
const BUSINESS_CLAIM_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /£\s?\d|\$\s?\d|\bprice[sd]?\b.{0,20}\bfrom\b/i, label: "pricing" },
  { pattern: /\bguarantee[d]?\b/i, label: "guarantee" },
  { pattern: /\bcertified\b|\baccredited\b|\bISO\s?\d+\b/i, label: "certification" },
  { pattern: /\d{1,3}%\s?(of|off|discount)/i, label: "statistic/discount" },
  { pattern: /"[^"]{15,}"\s*[-–—]\s*[A-Z][a-z]+/, label: "testimonial-like quote" },
];

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  const normalizedHaystack = normalizeKeyword(haystack);
  const normalizedNeedle = normalizeKeyword(needle);
  if (!normalizedNeedle) return 0;
  return normalizedHaystack.split(normalizedNeedle).length - 1;
}

export function runDeterministicChecks(input: DeterministicQaInput): DeterministicCheckResult[] {
  const { body, metadata, brief, knownPageUrls } = input;
  const results: DeterministicCheckResult[] = [];
  const words = wordCount(body);
  const primaryKeyword = brief.primaryKeyword?.text ?? null;

  // 1. Primary keyword presence
  const keywordOccurrences = primaryKeyword ? countOccurrences(body, primaryKeyword) : 0;
  results.push({
    id: "primary_keyword_presence",
    label: "Primary keyword present",
    severity: "blocking",
    passed: !primaryKeyword || keywordOccurrences >= MIN_PRIMARY_KEYWORD_OCCURRENCES,
    message: primaryKeyword
      ? `"${primaryKeyword}" appears ${keywordOccurrences} time(s) in the body.`
      : "No primary keyword on the brief — skipped.",
  });

  // 2. Title presence
  results.push({
    id: "title_presence",
    label: "SEO title present",
    severity: "blocking",
    passed: metadata.seoTitle.trim().length >= MIN_SEO_TITLE_LENGTH && metadata.seoTitle.trim().length <= MAX_SEO_TITLE_LENGTH,
    message: `SEO title is ${metadata.seoTitle.trim().length} characters (expected ${MIN_SEO_TITLE_LENGTH}-${MAX_SEO_TITLE_LENGTH}).`,
  });

  // 3. H1 presence
  results.push({
    id: "h1_presence",
    label: "H1 present",
    severity: "blocking",
    passed: metadata.h1.trim().length > 0,
    message: metadata.h1.trim().length > 0 ? `H1: "${metadata.h1}".` : "No H1 was produced.",
  });

  // 4. Metadata (meta description) presence + bounds
  const metaLength = metadata.metaDescription.trim().length;
  const metaOk = metaLength >= MIN_META_DESCRIPTION_LENGTH && metaLength <= MAX_META_DESCRIPTION_LENGTH;
  results.push({
    id: "meta_description_bounds",
    label: "Meta description length",
    severity: "warning",
    passed: metaOk,
    message: `Meta description is ${metaLength} characters (recommended ${MIN_META_DESCRIPTION_LENGTH}-${MAX_META_DESCRIPTION_LENGTH}).`,
  });

  // 5. Heading structure (## sections in the markdown body)
  const headingCount = (body.match(/^##\s+.+$/gm) ?? []).length;
  results.push({
    id: "heading_structure",
    label: "Section headings present",
    severity: "blocking",
    passed: headingCount >= MIN_HEADING_COUNT,
    message: `Found ${headingCount} "##" section heading(s).`,
  });

  // 6. URL recommendation validity (simple slug sanity check)
  const urlOk = /^[a-z0-9/_-]+$/.test(metadata.suggestedUrl.replace(/^https?:\/\/[^/]+/, "")) && !metadata.suggestedUrl.includes(" ");
  results.push({
    id: "url_recommendation_validity",
    label: "Suggested URL is a sane slug",
    severity: "warning",
    passed: urlOk,
    message: urlOk ? `"${metadata.suggestedUrl}" looks like a valid slug.` : `"${metadata.suggestedUrl}" contains spaces or unexpected characters.`,
  });

  // 7. Required topic coverage
  const topics = brief.recommendedTopics;
  const coveredTopics = topics.filter((t) => countOccurrences(body, t) > 0);
  const coverageRatio = topics.length === 0 ? 1 : coveredTopics.length / topics.length;
  results.push({
    id: "required_topic_coverage",
    label: "Recommended topic coverage",
    severity: topics.length > 0 && coveredTopics.length === 0 ? "blocking" : "warning",
    passed: topics.length === 0 || coverageRatio >= MIN_TOPIC_COVERAGE_RATIO,
    message: topics.length === 0 ? "No recommended topics on the brief." : `Covers ${coveredTopics.length}/${topics.length} recommended topics.`,
  });

  // 8. Keyword stuffing
  const densityPercent = words === 0 || !primaryKeyword ? 0 : (keywordOccurrences / words) * 100;
  results.push({
    id: "keyword_stuffing",
    label: "No obvious keyword stuffing",
    severity: "blocking",
    passed: densityPercent <= MAX_KEYWORD_DENSITY_PERCENT,
    message: `Primary keyword density is ${densityPercent.toFixed(2)}% (limit ${MAX_KEYWORD_DENSITY_PERCENT}%).`,
  });

  // 9. Empty/very short content
  results.push({
    id: "empty_or_short_content",
    label: "Content meets minimum length",
    severity: "blocking",
    passed: words >= MIN_CONTENT_WORD_COUNT,
    message: `Body is ${words} words (minimum ${MIN_CONTENT_WORD_COUNT}).`,
  });

  // 10. Malformed content (unbalanced markdown constructs)
  const openBrackets = (body.match(/\[/g) ?? []).length;
  const closeBrackets = (body.match(/\]/g) ?? []).length;
  const codeFences = (body.match(/```/g) ?? []).length;
  const malformed = openBrackets !== closeBrackets || codeFences % 2 !== 0;
  results.push({
    id: "malformed_content",
    label: "No malformed markdown",
    severity: "blocking",
    passed: !malformed,
    message: malformed ? "Unbalanced [] brackets or ``` code fences detected." : "No structural markdown issues detected.",
  });

  // 11. Placeholder text
  const placeholderHit = PLACEHOLDER_PATTERNS.find((re) => re.test(body) || re.test(metadata.seoTitle) || re.test(metadata.metaDescription));
  results.push({
    id: "placeholder_text",
    label: "No placeholder/generated-artifact text",
    severity: "blocking",
    passed: !placeholderHit,
    message: placeholderHit ? `Matched placeholder pattern: ${placeholderHit}.` : "No placeholder text detected.",
  });

  // 12. Internal link validity — never link to a page that doesn't exist.
  const linkValidation = validateInternalLinks(
    body,
    brief.website.baseUrl,
    knownPageUrls,
    brief.internalLinkOpportunities.map((l) => l.sourcePageUrl)
  );
  results.push({
    id: "internal_link_validity",
    label: "Internal links point to real pages",
    severity: "blocking",
    passed: linkValidation.invalidLinks.length === 0,
    message:
      linkValidation.invalidLinks.length === 0
        ? `${linkValidation.validLinks.length} internal link(s), all resolve to real pages.`
        : `${linkValidation.invalidLinks.length} internal link(s) point to pages that don't exist: ${linkValidation.invalidLinks.map((l) => l.href).join(", ")}.`,
  });
  if (linkValidation.missingSuggested.length > 0) {
    results.push({
      id: "internal_link_suggestions_used",
      label: "Suggested internal links used",
      severity: "warning",
      passed: false,
      message: `${linkValidation.missingSuggested.length} brief-suggested internal link(s) were not used: ${linkValidation.missingSuggested.join(", ")}.`,
    });
  }

  // 13. Business-claim / factuality safeguard. Pricing/guarantees/
  // certifications/testimonials have no corresponding configurable field
  // anywhere in this platform (unlike business_description/target_audience/
  // brand_voice/content_constraints, which do) — there is never a
  // legitimate source for these claims yet, so the check is unconditional.
  for (const { pattern, label } of BUSINESS_CLAIM_PATTERNS) {
    const hit = pattern.test(body);
    results.push({
      id: `business_claim_safeguard_${label.replace(/[^a-z]+/gi, "_")}`,
      label: `No invented ${label}`,
      severity: "blocking",
      passed: !hit,
      message: hit
        ? `Body appears to contain a ${label} claim, but no such business fact is configured on this website — this must not be invented.`
        : `No ${label} claim detected.`,
    });
  }

  return results;
}
