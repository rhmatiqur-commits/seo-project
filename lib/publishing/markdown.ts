/**
 * A small, pure Markdown -> HTML converter for exactly the subset our own
 * content-generation prompt asks the model to produce (lib/ai/prompts/
 * content.ts: headings via #, paragraphs, bold and italic emphasis,
 * [links](url), bulleted/numbered lists) — not a general-purpose CommonMark
 * implementation. WordPress's REST API `content` field expects HTML, our
 * content_versions.content is Markdown; this is the bridge, with no new
 * dependency. Unrecognized/unusual syntax passes through as escaped plain
 * text rather than breaking — a documented scope limit, not silent data loss.
 */

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderInline(text: string): string {
  let out = escapeHtml(text);
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label: string, href: string) => `<a href="${href}">${label}</a>`);
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  out = out.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  out = out.replace(/_([^_]+)_/g, "<em>$1</em>");
  return out;
}

export function markdownToHtml(markdown: string): string {
  const blocks = markdown
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);

  const html: string[] = [];
  for (const block of blocks) {
    const lines = block
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) continue;

    const headingMatch = /^(#{1,6})\s+(.*)$/.exec(lines[0]!);
    if (headingMatch && lines.length === 1) {
      const level = headingMatch[1]!.length;
      html.push(`<h${level}>${renderInline(headingMatch[2]!)}</h${level}>`);
      continue;
    }

    if (lines.every((l) => /^[-*+]\s+/.test(l))) {
      const items = lines.map((l) => `<li>${renderInline(l.replace(/^[-*+]\s+/, ""))}</li>`).join("");
      html.push(`<ul>${items}</ul>`);
      continue;
    }

    if (lines.every((l) => /^\d+\.\s+/.test(l))) {
      const items = lines.map((l) => `<li>${renderInline(l.replace(/^\d+\.\s+/, ""))}</li>`).join("");
      html.push(`<ol>${items}</ol>`);
      continue;
    }

    html.push(`<p>${lines.map(renderInline).join(" ")}</p>`);
  }

  return html.join("\n");
}
