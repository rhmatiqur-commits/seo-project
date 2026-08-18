import Link from "next/link";
import type { AttentionItem } from "@/lib/dashboard/attention";

export interface AttentionListProps {
  items: AttentionItem[];
}

/**
 * Renders the items lib/dashboard/attention.ts's buildAttentionItems
 * produces. Wrapped in .dash-card.action (a left accent bar, the same
 * primitive Opportunities' decision cards already use) when there's
 * something to act on — that's what gives this section its visual
 * prominence, not a new colour or component class. Renders a quiet,
 * unwrapped confirmation line when the list is empty, matching how the
 * rest of this page treats a genuinely good state.
 */
export function AttentionList({ items }: AttentionListProps) {
  if (items.length === 0) {
    return <p className="dash-muted" style={{ fontSize: "0.9rem", margin: 0 }}>Nothing needs your attention right now — nicely done.</p>;
  }

  return (
    <div className="dash-card action">
      {items.map((item) => {
        const content = (
          <>
            <div>
              <div className="primary">{item.label}</div>
              {item.description && <div className="secondary">{item.description}</div>}
            </div>
            {typeof item.count === "number" && <span className={`dash-badge ${item.tone}`}>{item.count}</span>}
          </>
        );
        return item.href ? (
          <Link key={item.key} href={item.href} className="dash-list-row" style={{ color: "inherit" }}>
            {content}
          </Link>
        ) : (
          <div key={item.key} className="dash-list-row">
            {content}
          </div>
        );
      })}
    </div>
  );
}
