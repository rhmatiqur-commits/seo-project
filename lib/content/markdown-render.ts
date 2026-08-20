/**
 * Phase 7.1E: a small, dependency-free parser for the specific Markdown
 * subset this platform's own content-generation prompt actually produces
 * (lib/ai/prompts/content.ts: "Write in Markdown... Use ## for section
 * headings"), plus the constructs its own deterministic QA already validates
 * (markdown links — lib/content/qa/internal-links.ts) or explicitly forbids
 * (unbalanced ``` fences — lib/content/qa/deterministic.ts's
 * malformed_content check). No new dependency: the real body content is a
 * narrow, predictable subset (headings, paragraphs, bold/italic, links,
 * bullet/numbered lists, occasional fenced code), not general-purpose
 * Markdown, so a full CommonMark parser would be solving a problem this
 * platform doesn't have.
 *
 * Deliberately returns structured data, not an HTML string — the caller
 * (ContentBody) renders it through ordinary React elements, so AI-authored
 * text is always passed through React's own escaping and never through
 * dangerouslySetInnerHTML.
 */

export type InlineSegment =
  | { type: "text"; text: string }
  | { type: "bold"; text: string }
  | { type: "italic"; text: string }
  | { type: "link"; text: string; href: string };

export type MarkdownBlock =
  | { type: "heading"; level: 1 | 2 | 3; inline: InlineSegment[] }
  | { type: "paragraph"; inline: InlineSegment[] }
  | { type: "list"; ordered: boolean; items: InlineSegment[][] }
  | { type: "code"; text: string };

const HEADING_RE = /^(#{1,3})\s+(.*)$/;
const BULLET_RE = /^[-*]\s+(.*)$/;
const NUMBERED_RE = /^\d+\.\s+(.*)$/;
const CODE_FENCE_RE = /^```/;
const INLINE_RE = /\*\*(.+?)\*\*|\*(.+?)\*|\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/;

/** Splits one line/paragraph of text into bold/italic/link/text runs. Order
 * of alternation in INLINE_RE matters: **bold** is tried before *italic* so
 * a bold run's own asterisks are never mis-split as two italic runs. */
function parseInline(text: string): InlineSegment[] {
  const segments: InlineSegment[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    const match = INLINE_RE.exec(remaining);
    if (!match) {
      segments.push({ type: "text", text: remaining });
      break;
    }
    if (match.index > 0) segments.push({ type: "text", text: remaining.slice(0, match.index) });
    if (match[1] !== undefined) segments.push({ type: "bold", text: match[1] });
    else if (match[2] !== undefined) segments.push({ type: "italic", text: match[2] });
    else if (match[3] !== undefined && match[4] !== undefined) segments.push({ type: "link", text: match[3]!, href: match[4]! });
    remaining = remaining.slice(match.index + match[0].length);
  }
  return segments;
}

export function parseMarkdownBlocks(markdown: string): MarkdownBlock[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: MarkdownBlock[] = [];

  let paragraphLines: string[] = [];
  let listItems: InlineSegment[][] = [];
  let listOrdered = false;

  const flushParagraph = () => {
    if (paragraphLines.length > 0) {
      blocks.push({ type: "paragraph", inline: parseInline(paragraphLines.join(" ")) });
      paragraphLines = [];
    }
  };
  const flushList = () => {
    if (listItems.length > 0) {
      blocks.push({ type: "list", ordered: listOrdered, items: listItems });
      listItems = [];
    }
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;

    if (CODE_FENCE_RE.test(line)) {
      flushParagraph();
      flushList();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !CODE_FENCE_RE.test(lines[i]!)) {
        codeLines.push(lines[i]!);
        i++;
      }
      blocks.push({ type: "code", text: codeLines.join("\n") });
      i++; // skip the closing fence (if the body is malformed/unclosed, this just runs to the end — deterministic QA already blocks unbalanced fences before a draft ever reaches review)
      continue;
    }

    const headingMatch = HEADING_RE.exec(line);
    if (headingMatch) {
      flushParagraph();
      flushList();
      const level = headingMatch[1]!.length as 1 | 2 | 3;
      blocks.push({ type: "heading", level, inline: parseInline(headingMatch[2]!.trim()) });
      i++;
      continue;
    }

    const bulletMatch = BULLET_RE.exec(line);
    const numberedMatch = bulletMatch ? null : NUMBERED_RE.exec(line);
    if (bulletMatch || numberedMatch) {
      flushParagraph();
      const ordered = Boolean(numberedMatch);
      if (listItems.length > 0 && listOrdered !== ordered) flushList();
      listOrdered = ordered;
      const itemText = (bulletMatch ?? numberedMatch)![1]!;
      listItems.push(parseInline(itemText));
      i++;
      continue;
    }

    if (line.trim() === "") {
      flushParagraph();
      flushList();
      i++;
      continue;
    }

    flushList();
    paragraphLines.push(line.trim());
    i++;
  }

  flushParagraph();
  flushList();
  return blocks;
}
