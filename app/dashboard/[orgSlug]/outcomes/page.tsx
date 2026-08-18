import { requireOrganizationMembership } from "@/lib/auth/session";
import { getPrimaryWebsiteForOrganization } from "@/lib/dashboard/website";
import { listSeoActionsForWebsite } from "@/lib/db/seo-actions";
import { listLatestOutcomesByActionForWebsite } from "@/lib/db/seo-action-outcomes";
import { EmptyState } from "@/app/dashboard/_components/EmptyState";

export const dynamic = "force-dynamic";

const CLASSIFICATION_TONE: Record<string, string> = {
  POSITIVE: "success",
  NEGATIVE: "danger",
  MIXED: "warning",
  INCONCLUSIVE: "info",
  INSUFFICIENT_DATA: "info",
};

const CLASSIFICATION_LABEL: Record<string, string> = {
  POSITIVE: "Improved",
  NEGATIVE: "Declined",
  MIXED: "Mixed result",
  INCONCLUSIVE: "No clear change yet",
  INSUFFICIENT_DATA: "Still gathering data",
};

const RECOMMENDATION_LABEL: Record<string, string> = {
  MONITOR: "Monitoring — no action needed",
  INVESTIGATE_CTR: "Worth investigating: click-through rate",
  DIAGNOSE_DECLINE: "Needs a closer look",
  WAIT_FOR_MORE_DATA: "Waiting for more data",
};

function fmt(date: string | null): string {
  return date ? new Date(date).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "-";
}

interface WindowMetricsLike {
  clicks?: number;
  impressions?: number;
  position?: number | null;
}

export default async function OutcomesPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { organization } = await requireOrganizationMembership(orgSlug);
  const website = await getPrimaryWebsiteForOrganization(organization.id);
  const [actions, latestOutcomes] = website
    ? await Promise.all([listSeoActionsForWebsite(website.id, { status: "EXECUTED" }), listLatestOutcomesByActionForWebsite(website.id)])
    : [[], new Map()];

  return (
    <>
      <h1 className="dash-page-title">Outcomes</h1>
      <p className="dash-page-subtitle">What happened after each SEO action we took, measured against real Google Search Console data.</p>
      <div className="dash-notice">
        These describe <strong>observed change following an action</strong> — never a claim that the action alone caused it. SEO
        performance is affected by many factors (algorithm updates, seasonality, competitors) beyond what any single change controls.
      </div>

      {actions.length === 0 && (
        <EmptyState title="No completed SEO actions yet" description="Outcomes appear here once a published page or completed task has had time to be measured against Search Console data." />
      )}

      <div className="dash-grid">
        {actions.map((action) => {
          const outcome = latestOutcomes.get(action.id);
          const baseline = (outcome?.baseline_metrics ?? {}) as WindowMetricsLike;
          const current = (outcome?.current_metrics ?? {}) as WindowMetricsLike;
          return (
            <div key={action.id} className="dash-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{action.target_url ?? action.target_keyword_text ?? action.action_type.replace(/_/g, " ")}</div>
                  <div className="dash-muted" style={{ fontSize: "0.8rem" }}>
                    {action.action_type.replace(/_/g, " ")} &middot; live since {fmt(action.executed_at)}
                  </div>
                </div>
                {outcome ? (
                  <span className={`dash-badge ${CLASSIFICATION_TONE[outcome.classification]}`}>{CLASSIFICATION_LABEL[outcome.classification]}</span>
                ) : (
                  <span className="dash-badge info">Baseline being established</span>
                )}
              </div>
              {outcome && (
                <>
                  <p style={{ fontSize: "0.86rem", marginTop: 12 }}>{outcome.classification_reasoning}</p>
                  <div className="dash-grid dash-grid-cols-3" style={{ marginTop: 8 }}>
                    <div>
                      <div className="dash-stat-label">Clicks</div>
                      <div style={{ fontSize: "0.95rem" }}>
                        {baseline.clicks ?? 0} &rarr; {current.clicks ?? 0}
                      </div>
                    </div>
                    <div>
                      <div className="dash-stat-label">Impressions</div>
                      <div style={{ fontSize: "0.95rem" }}>
                        {baseline.impressions ?? 0} &rarr; {current.impressions ?? 0}
                      </div>
                    </div>
                    <div>
                      <div className="dash-stat-label">Position</div>
                      <div style={{ fontSize: "0.95rem" }}>
                        {baseline.position ?? "-"} &rarr; {current.position ?? "-"}
                      </div>
                    </div>
                  </div>
                  <p className="dash-muted" style={{ fontSize: "0.8rem", marginTop: 10 }}>
                    Measured over {outcome.measurement_window_days} days &middot; {RECOMMENDATION_LABEL[outcome.recommendation]}
                  </p>
                  {outcome.ai_interpretation && (
                    <p className="dash-muted" style={{ fontSize: "0.82rem", marginTop: 6, fontStyle: "italic" }}>
                      {outcome.ai_interpretation}
                    </p>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
