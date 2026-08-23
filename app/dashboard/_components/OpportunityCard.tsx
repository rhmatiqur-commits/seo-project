import Link from "next/link";
import type { OpportunityCardViewModel } from "@/lib/dashboard/opportunity-detail";
import { ActionGroup } from "./ActionGroup";
import { SubmitButton } from "./SubmitButton";

export interface OpportunityCardProps {
  opportunity: OpportunityCardViewModel;
  orgSlug: string;
  canAct: boolean;
  acceptAction: (formData: FormData) => Promise<void>;
  dismissAction: (formData: FormData) => Promise<void>;
}

/**
 * Phase 7.1D: the reusable opportunity card — scannable at a glance (impact,
 * type, title, one-line description, affected page, a short rationale
 * teaser) with the full rationale reserved for the detail page. The title
 * is the only element that navigates (spec: "Clicking the opportunity
 * should lead to its detail page"); Accept/Dismiss stay separate forms
 * below it so nothing ends up nesting a <form> inside the <a>.
 */
export function OpportunityCard({ opportunity: o, orgSlug, canAct, acceptAction, dismissAction }: OpportunityCardProps) {
  const detailHref = `/dashboard/${orgSlug}/opportunities/${o.id}`;
  return (
    <div className={`dash-card${canAct ? " action" : ""}`}>
      <div>
        <span className={`dash-badge ${o.impactTone}`}>{o.impactLabel}</span>{" "}
        <span className="dash-badge neutral">{o.typeLabel}</span>
        <h3 style={{ margin: "8px 0 4px" }}>
          <Link href={detailHref} style={{ color: "inherit" }}>
            {o.title}
          </Link>
        </h3>
      </div>
      <p className="dash-muted" style={{ fontSize: "0.88rem" }}>
        {o.description}
      </p>
      {o.affectedPageUrl && (
        <p className="dash-muted" style={{ fontSize: "0.8rem", marginTop: -4 }}>
          Affects: {o.affectedPageUrl}
        </p>
      )}
      <p style={{ fontSize: "0.85rem", color: "var(--dash-text-muted)" }}>{o.rationaleTeaser}</p>
      <p style={{ marginTop: 4, marginBottom: canAct ? undefined : 0 }}>
        <Link href={detailHref} style={{ fontSize: "0.85rem" }}>
          View details &rarr;
        </Link>
      </p>
      {canAct && (
        <ActionGroup>
          <div className="dash-row" style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <form action={acceptAction}>
              <input type="hidden" name="org_slug" value={orgSlug} />
              <input type="hidden" name="opportunity_id" value={o.id} />
              <SubmitButton variant="primary" pendingLabel="Accepting…">
                Accept opportunity
              </SubmitButton>
            </form>
            <form action={dismissAction}>
              <input type="hidden" name="org_slug" value={orgSlug} />
              <input type="hidden" name="opportunity_id" value={o.id} />
              <SubmitButton variant="ghost" pendingLabel="Dismissing…">
                Dismiss
              </SubmitButton>
            </form>
          </div>
        </ActionGroup>
      )}
      {/* Phase 7.2F: same "explain the missing control" idiom Settings (7.2B)
          and content-detail (7.2D) already established — canAct is the only
          gate on Accept/Dismiss, so its inverse is the only thing needed
          here. Cards are only ever rendered for status "new" opportunities
          (OpportunityBrowser filters to filteredOpen before mapping), so no
          extra status check is needed to keep this scoped to opportunities
          where the control would otherwise have appeared. */}
      {!canAct && (
        <p className="dash-muted" style={{ fontSize: "0.78rem", marginTop: 12, marginBottom: 0 }}>
          Only Managers and above can accept or dismiss opportunities — ask a teammate with that role.
        </p>
      )}
    </div>
  );
}
