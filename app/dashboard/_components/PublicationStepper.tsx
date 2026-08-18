import { getPublicationStageInfo, PUBLICATION_STAGES } from "@/lib/dashboard/publication-stage";
import type { PublicationStatus } from "@/lib/supabase/types";

export interface PublicationStepperProps {
  status: PublicationStatus;
}

/**
 * A publication has 11+ possible statuses that used to render as one of
 * three badge colours (mostly "warning"), so a client couldn't tell "just
 * started" from "one click from live". This renders the same status as a
 * 5-stage shape instead — reusable, deterministic (see
 * lib/dashboard/publication-stage.ts), and read-only: it never changes what
 * status means, only how it's displayed.
 */
export function PublicationStepper({ status }: PublicationStepperProps) {
  const { stageIndex, failed } = getPublicationStageInfo(status);

  return (
    <div className="dash-stepper" role="list" aria-label="Publication progress">
      {PUBLICATION_STAGES.map((label, i) => {
        const isFailedHere = failed && i === stageIndex;
        const isDone = !failed && i < stageIndex;
        const isCurrent = !failed && i === stageIndex;
        const stepClass = isFailedHere ? "failed" : isDone ? "done" : isCurrent ? "current" : "";
        return (
          <span className="dash-stepper-step-wrap" key={label} style={{ display: "flex", alignItems: "center" }}>
            <span className={`dash-stepper-step ${stepClass}`.trim()} role="listitem">
              <span className="dash-stepper-dot" aria-hidden="true" />
              <span className="dash-stepper-label">{label}</span>
            </span>
            {i < PUBLICATION_STAGES.length - 1 && <span className="dash-stepper-connector" aria-hidden="true" />}
          </span>
        );
      })}
      {failed && (
        <span className="dash-badge danger" style={{ marginLeft: 8 }}>
          {status === "UNPUBLISHED" ? "Taken down" : "Failed"}
        </span>
      )}
    </div>
  );
}
