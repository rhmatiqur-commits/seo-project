const STAGES = ["Accepted", "Content brief prepared", "Content generated", "Quality checks", "Your approval", "Preview", "Production"];

/**
 * Phase 7.1D: a static, explanatory diagram shown on content-eligible
 * opportunities — it explains the conceptual path content takes after
 * acceptance, it does not track real progress. None of these stages are
 * ever marked done/current (spec: "Do not mark future stages as active. Do
 * not show fake progress."), because today nothing downstream of "Accepted"
 * is actually client-triggerable — content brief creation remains
 * admin-only (see lib/content/create-brief.ts). Reuses the same
 * .dash-stepper classes PublicationStepper introduced in Phase 6A, just
 * with every step left in its plain/neutral state.
 */
export function ContentPipelinePreview() {
  return (
    <div>
      <div className="dash-stepper" role="list" aria-label="Content pipeline overview">
        {STAGES.map((label, i) => (
          <span className="dash-stepper-step-wrap" key={label} style={{ display: "flex", alignItems: "center" }}>
            <span className="dash-stepper-step" role="listitem">
              <span className="dash-stepper-dot" aria-hidden="true" />
              <span className="dash-stepper-label">{label}</span>
            </span>
            {i < STAGES.length - 1 && <span className="dash-stepper-connector" aria-hidden="true" />}
          </span>
        ))}
      </div>
      <p className="dash-muted" style={{ fontSize: "0.82rem", marginTop: 10 }}>
        This shows the general path content takes once an opportunity is accepted — it isn&apos;t a live progress
        tracker. Your team prepares the content brief; you&apos;ll see it appear on the Content page once work has
        actually started.
      </p>
    </div>
  );
}
