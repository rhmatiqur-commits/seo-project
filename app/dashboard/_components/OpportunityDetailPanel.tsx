import Link from "next/link";
import type { OpportunityDetailViewModel } from "@/lib/dashboard/opportunity-detail";
import { OPPORTUNITY_TASK_STAGES, opportunityTaskStageInfo, taskStatusLabel, taskStatusTone } from "@/lib/dashboard/task-status";
import { isMeasurableOpportunityType } from "@/lib/outcomes/action-type";
import type { OutcomeSummaryViewModel } from "@/lib/dashboard/outcome-summary";
import { ActionGroup } from "./ActionGroup";
import { SubmitButton } from "./SubmitButton";
import { ContentPipelinePreview } from "./ContentPipelinePreview";
import type { TaskStatus } from "@/lib/supabase/types";

export interface OpportunityDetailPanelProps {
  opportunity: OpportunityDetailViewModel;
  orgSlug: string;
  canAct: boolean;
  acceptAction: (formData: FormData) => Promise<void>;
  dismissAction: (formData: FormData) => Promise<void>;
  /** The content_briefs.id already created for this opportunity, if any — null means none exists yet. */
  contentBriefId: string | null;
  /** canEditContent(membership.role) — the same gate generateContentAction already uses. */
  canCreateContent: boolean;
  createContentAction: (formData: FormData) => Promise<void>;
  /** The linked seo_tasks row's status, if one exists — null means no task exists (an honest state, never invented). */
  taskStatus: TaskStatus | null;
  /** Phase 7.2A: what, if anything, seo_action_outcomes says about this opportunity's own action — see lib/dashboard/outcome-summary.ts for the 4-state model. */
  outcomeSummary: OutcomeSummaryViewModel;
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
export function OpportunityDetailPanel({
  opportunity: o,
  orgSlug,
  canAct,
  acceptAction,
  dismissAction,
  contentBriefId,
  canCreateContent,
  createContentAction,
  taskStatus,
  outcomeSummary,
}: OpportunityDetailPanelProps) {
  const statusMessage = STATUS_MESSAGE[o.status];
  const measurable = isMeasurableOpportunityType(o.type);
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
          {o.status === "approved" &&
            (contentBriefId ? (
              <p style={{ marginTop: 12 }}>
                <Link href={`/dashboard/${orgSlug}/content/${contentBriefId}`}>View content &rarr;</Link>
              </p>
            ) : canCreateContent ? (
              <form action={createContentAction} style={{ marginTop: 12 }}>
                <input type="hidden" name="org_slug" value={orgSlug} />
                <input type="hidden" name="opportunity_id" value={o.id} />
                <SubmitButton variant="secondary" pendingLabel="Creating…">
                  Create content
                </SubmitButton>
              </form>
            ) : (
              <p className="dash-muted" style={{ fontSize: "0.85rem", marginTop: 12 }}>
                Your team will prepare content for this.
              </p>
            ))}
        </section>
      )}

      {!o.contentEligible && o.status === "approved" && measurable && (
        <section className="dash-section">
          <h2 className="dash-subsection-heading">Task status</h2>
          {taskStatus ? (
            <>
              <div className="dash-stepper" role="list" aria-label="Task progress">
                {OPPORTUNITY_TASK_STAGES.map((label, i) => {
                  const info = opportunityTaskStageInfo(taskStatus);
                  const isFailedHere = info.cancelled && i === info.stageIndex;
                  const isDone = !info.cancelled && i < info.stageIndex;
                  const isCurrent = !info.cancelled && i === info.stageIndex;
                  const stepClass = isFailedHere ? "failed" : isDone ? "done" : isCurrent ? "current" : "";
                  return (
                    <span className="dash-stepper-step-wrap" key={label} style={{ display: "flex", alignItems: "center" }}>
                      <span className={`dash-stepper-step ${stepClass}`.trim()} role="listitem">
                        <span className="dash-stepper-dot" aria-hidden="true" />
                        <span className="dash-stepper-label">{label}</span>
                      </span>
                      {i < OPPORTUNITY_TASK_STAGES.length - 1 && <span className="dash-stepper-connector" aria-hidden="true" />}
                    </span>
                  );
                })}
                {taskStatus === "cancelled" && (
                  <span className="dash-badge danger" style={{ marginLeft: 8 }}>
                    {taskStatusLabel(taskStatus)}
                  </span>
                )}
              </div>
              <p className="dash-muted" style={{ fontSize: "0.82rem", marginTop: 8 }}>
                Accepting doesn&apos;t fix this on its own — it&apos;s tracked as a task for your team. You can also follow it on the{" "}
                <Link href={`/dashboard/${orgSlug}/tasks`}>Tasks page</Link>.
              </p>
            </>
          ) : (
            <p className="dash-muted" style={{ fontSize: "0.85rem" }}>
              No task has been created for this opportunity yet.
            </p>
          )}
        </section>
      )}

      {/* Phase 7.2A: the 3 investigative types (RESEARCH_REQUIRED,
          INVESTIGATE_DECLINE, INVESTIGATE_OPPORTUNITY) never produce a
          seo_actions row and never will — the 3-stage stepper above implies
          a kind of tracking that doesn't apply to them, so they get their
          own, more honest presentation instead of sharing it. */}
      {!o.contentEligible && o.status === "approved" && !measurable && (
        <section className="dash-section">
          <h2 className="dash-subsection-heading">Investigation status</h2>
          {taskStatus ? (
            <>
              <span className={`dash-badge ${taskStatusTone(taskStatus)}`}>{taskStatusLabel(taskStatus)}</span>
              <p className="dash-muted" style={{ fontSize: "0.82rem", marginTop: 8 }}>
                This is a research prompt, not a tracked SEO action — accepting it doesn&apos;t start any automatic measurement. If it
                leads to a specific fix, that becomes its own opportunity. You can update its status on the{" "}
                <Link href={`/dashboard/${orgSlug}/tasks`}>Tasks page</Link>.
              </p>
            </>
          ) : (
            <p className="dash-muted" style={{ fontSize: "0.85rem" }}>
              No task has been created for this opportunity yet.
            </p>
          )}
        </section>
      )}

      {o.status === "approved" && measurable && (
        <section className="dash-section">
          <h2 className="dash-subsection-heading">Outcome</h2>
          <span className={`dash-badge ${outcomeSummary.tone}`}>{outcomeSummary.label}</span>
          {outcomeSummary.state === "not-yet-live" && (
            <p className="dash-muted" style={{ fontSize: "0.82rem", marginTop: 8 }}>
              {o.contentEligible
                ? "Once this page is published, we'll start measuring what happens to it in Google Search Console."
                : "Once this task is marked done, we'll start measuring what happens to the affected page in Google Search Console."}
            </p>
          )}
          {outcomeSummary.state === "measuring" && (
            <p className="dash-muted" style={{ fontSize: "0.82rem", marginTop: 8 }}>
              We're waiting for enough Search Console data to compare against — this can take a few weeks. Check{" "}
              <Link href={`/dashboard/${orgSlug}/outcomes`}>Outcomes</Link> for the full picture once it's ready.
            </p>
          )}
          {outcomeSummary.state === "classified" && (
            <>
              <p style={{ fontSize: "0.86rem", marginTop: 12 }}>{outcomeSummary.reasoning}</p>
              <p className="dash-muted" style={{ fontSize: "0.8rem", marginTop: 6 }}>
                Measured over {outcomeSummary.measurementWindowDays} days &middot; {outcomeSummary.recommendationLabel}
              </p>
              {outcomeSummary.followUpOpportunityId && (
                <p style={{ fontSize: "0.82rem", marginTop: 8 }}>
                  A follow-up opportunity was created following this result —{" "}
                  <Link href={`/dashboard/${orgSlug}/opportunities/${outcomeSummary.followUpOpportunityId}`}>view it &rarr;</Link>
                </p>
              )}
              <p style={{ fontSize: "0.82rem", marginTop: 8 }}>
                <Link href={`/dashboard/${orgSlug}/outcomes`}>See full outcome details &rarr;</Link>
              </p>
            </>
          )}
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
      {/* Phase 7.2F: same idiom as OpportunityCard — mirrors the exact
          canAct && o.status === "new" guard above so this only ever appears
          where the control itself would otherwise have appeared, never on
          an opportunity that's already been decided. */}
      {!canAct && o.status === "new" && (
        <p className="dash-muted" style={{ fontSize: "0.82rem", marginTop: 20 }}>
          Only Managers and above can accept or dismiss opportunities — ask a teammate with that role.
        </p>
      )}
    </>
  );
}
