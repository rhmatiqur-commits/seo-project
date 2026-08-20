import { parseMarkdownBlocks, type InlineSegment } from "@/lib/content/markdown-render";

function renderInline(segments: InlineSegment[], keyPrefix: string) {
  return segments.map((seg, i) => {
    const key = `${keyPrefix}-${i}`;
    if (seg.type === "bold") return <strong key={key}>{seg.text}</strong>;
    if (seg.type === "italic") return <em key={key}>{seg.text}</em>;
    if (seg.type === "link")
      return (
        <a key={key} href={seg.href} target="_blank" rel="noreferrer">
          {seg.text}
        </a>
      );
    return <span key={key}>{seg.text}</span>;
  });
}

export interface ContentBodyProps {
  /** The draft's raw Markdown body (content_versions.content) — parsed here, never sent through dangerouslySetInnerHTML. */
  markdown: string;
}

/**
 * Phase 7.1E: renders a content draft as formatted text instead of the raw
 * Markdown source a client would otherwise see (literal ## characters,
 * etc). Headings are offset down two levels (## -> <h3>) so a draft's own
 * section headings never outrank this page's real <h1>/<h2>.
 */
export function ContentBody({ markdown }: ContentBodyProps) {
  const blocks = parseMarkdownBlocks(markdown);
  return (
    <div className="dash-content-body">
      {blocks.map((block, i) => {
        const key = `block-${i}`;
        if (block.type === "heading") {
          const inline = renderInline(block.inline, key);
          if (block.level === 1) return <h2 key={key}>{inline}</h2>;
          if (block.level === 2) return <h3 key={key}>{inline}</h3>;
          return <h4 key={key}>{inline}</h4>;
        }
        if (block.type === "paragraph") return <p key={key}>{renderInline(block.inline, key)}</p>;
        if (block.type === "list") {
          const items = block.items.map((item, j) => <li key={`${key}-${j}`}>{renderInline(item, `${key}-${j}`)}</li>);
          return block.ordered ? <ol key={key}>{items}</ol> : <ul key={key}>{items}</ul>;
        }
        return (
          <pre key={key} className="dash-content-code">
            <code>{block.text}</code>
          </pre>
        );
      })}
    </div>
  );
}
