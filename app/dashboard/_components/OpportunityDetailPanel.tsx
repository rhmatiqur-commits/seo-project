import Link from "next/link";
import type { OpportunityDetailViewModel } from "@/lib/dashboard/opportunity-detail";
import { ActionGroup } from "./ActionGroup";
import { SubmitButton } from "./SubmitButton";
import { ContentPipelinePreview } from "./ContentPipelinePreview";

export interface OpportunityDetailPanelProps {
  opportunity: OpportunityDetailViewModel;
  orgSlug: string;
  canAct: boolean;
  acceptAction: (formData: FormData) => Promise<void>;
  dismissAction: (formData: FormData) => Promise<void>;
}

const STATUS_MESSAGE: Partial<Record<OpportunityDetailViewModel["status"], string>> = {
  approved: "Accepted — this opportunity is now in the team's workflow.",
  rejected: "Dismissed — this opportunity won't be pursued, but nothing has been deleted.",
  done: "This opportunity has been completed.",
};

/**
 * Phase 7.1D: the opportunity detail route's content — full rationale (only
 * truncated on the card), the detector's own written reasoning when this
 * opportunity was promoted from a search-performance detector row, the
 * affected page, the recommended action, current status, and Accept/Dismiss.
 * Never renders priority_score, priority_components, detector_type, or any
 * internal id (spec section 6).
 */
export function OpportunityDetailPanel({ opportunity: o, orgSlug, canAct, acceptAction, dismissAction }: OpportunityDetailPanelProps) {
  const statusMessage = STATUS_MESSAGE[o.status];
  return (
    <>
      <p style={{ marginBottom: 12 }}>
        <Link href={`/dashboard/${orgSlug}/opportunities`}>&larr; Back to opportunities</Link>
      </p>

      <div>
        <span className={`dash-badge ${o.impactTone}`}>{o.impactLabel}</span>{" "}
        <span className="dash-badge neutral">{o.typeLabel}</span>{" "}
        <span className="dash-badge brand">{o.statusLabel}</span>
      </div>
      <h1 className="dash-page-title" style={{ marginTop: 8 }}>
        {o.title}
      </h1>

      <p>{o.description}</p>

      {o.affectedPageUrl && (
        <p className="dash-muted" style={{ fontSize: "0.88rem" }}>
          Affected page: {o.affectedPageUrl}
        </p>
      )}

      <p className="dash-muted" style={{ fontSize: "0.88rem" }}>
        Recommended action: {o.typeLabel}
      </p>

      {statusMessage && (
        <div className="dash-notice" style={{ marginTop: 16 }}>
          {statusMessage}
        </div>
      )}

      <section className="dash-section">
        <h2 className="dash-subsection-heading">Why this matters</h2>
        <p>{o.rationale}</p>
      </section>

      {o.detectorExplanation && (
        <section className="dash-section">
          <h2 className="dash-subsection-heading">What we saw</h2>
          <p>This opportunity was flagged because: {o.detectorExplanation}</p>
        </section>
      )}

      {o.contentEligible && (
        <section className="dash-section">
          <h2 className="dash-subsection-heading">What happens after acceptance</h2>
          <ContentPipelinePreview />
        </section>
      )}

      {canAct && o.status === "new" && (
        <ActionGroup>
          <div className="dash-row" style={{ display: "flex", gap: 8, marginTop: 20 }}>
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
                Dismiss opportunity
              </SubmitButton>
            </form>
          </div>
        </ActionGroup>
      )}
    </>
  );
}
