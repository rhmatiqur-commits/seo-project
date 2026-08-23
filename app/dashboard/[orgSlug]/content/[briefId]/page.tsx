import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrganizationMembership } from "@/lib/auth/session";
import { assertOwnedByOrganization } from "@/lib/api/authorize";
import { getContentBrief, listContentJobsForBrief, listContentVersionsForBrief, getLatestQaResultForVersion } from "@/lib/db/content";
import { getCmsConnectionForWebsite } from "@/lib/db/cms-connections";
import { getPublicationForVersion } from "@/lib/db/content-publications";
import { toPublicConnection } from "@/lib/publishing/connection-view";
import { availableContentActions } from "@/lib/content/state-machine";
import { canApproveContent, canEditContent, canPreparePublication, canPublishToProduction } from "@/lib/auth/permissions";
import { generateContentAction, reviseContentAction, approveContentDashboardAction, rejectContentDashboardAction, preparePublicationAction, approveProductionMergeAction } from "@/app/dashboard/actions";
import { SubmitButton } from "@/app/dashboard/_components/SubmitButton";
import { ConfirmSubmitButton } from "@/app/dashboard/_components/ConfirmSubmitButton";
import { ActionGroup } from "@/app/dashboard/_components/ActionGroup";
import { EmptyState } from "@/app/dashboard/_components/EmptyState";
import { PublicationStepper } from "@/app/dashboard/_components/PublicationStepper";
import { ContentBody } from "@/app/dashboard/_components/ContentBody";
import { QaIssueList } from "@/app/dashboard/_components/QaIssueList";
import { contentStatusLabel } from "@/lib/dashboard/status-labels";
import { attemptContextLabel, isAutomaticRetryInProgress } from "@/lib/dashboard/content-status";
import type { ContentBrief } from "@/lib/content/brief-types";
import type { ContentPipelineStatus } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

function fmt(date: string | null): string {
  return date ? new Date(date).toLocaleString() : "-";
}

/** Phase 7.1E: a status-change confirmation sentence, same idiom 7.1D
 * introduced for opportunities (STATUS_MESSAGE in OpportunityDetailPanel) —
 * shown once the job has actually settled into that state, not a transient
 * toast. */
const STATUS_MESSAGE: Partial<Record<ContentPipelineStatus, string>> = {
  APPROVED: "Approved — ready to be prepared for publishing.",
  REJECTED: "Rejected — this draft won't be published. You can generate a new attempt.",
};

export default async function ContentBriefDashboardPage({ params }: { params: Promise<{ orgSlug: string; briefId: string }> }) {
  const { orgSlug, briefId } = await params;
  const { organization, membership } = await requireOrganizationMembership(orgSlug);

  const briefRow = await getContentBrief(briefId);
  assertOwnedByOrganization(briefRow, organization.id, "ContentBrief", briefId);
  if (!briefRow) notFound();

  const [jobs, versions] = await Promise.all([listContentJobsForBrief(briefRow.id), listContentVersionsForBrief(briefRow.id)]);
  const latestJob = jobs[0] ?? null;
  const latestVersion = versions[versions.length - 1] ?? null;
  const latestQa = latestVersion ? await getLatestQaResultForVersion(latestVersion.id) : null;
  const [connectionRow, publication] = await Promise.all([
    getCmsConnectionForWebsite(briefRow.website_id),
    latestVersion ? getPublicationForVersion(latestVersion.id) : Promise.resolve(null),
  ]);
  const connection = connectionRow ? toPublicConnection(connectionRow) : null;

  const brief = briefRow.brief_data as unknown as ContentBrief;
  const actions = latestJob ? availableContentActions(latestJob.status) : { canApprove: false, canReject: false, canRevise: false };
  const canGenerate = canEditContent(membership.role) && (!latestJob || latestJob.status === "APPROVED" || latestJob.status === "REJECTED");
  const canReview = canApproveContent(membership.role);
  const canRevise = canEditContent(membership.role) && actions.canRevise;
  const canPublishNow = latestJob?.status === "APPROVED" && connection?.status === "active";

  const statusMessage = latestJob ? STATUS_MESSAGE[latestJob.status] : undefined;
  const autoRetrying = latestJob ? isAutomaticRetryInProgress(latestJob.status, latestJob.attempts) : false;
  const showAttemptContext = Boolean(latestJob && latestJob.attempts > 0);
  const previewAvailable = Boolean(publication?.pull_request_url || publication?.preview_url);
  const isLive = publication?.status === "PUBLISHED";

  return (
    <>
      <p>
        <Link href={`/dashboard/${orgSlug}/content`}>&larr; Content</Link>
      </p>
      <h1 className="dash-page-title">{briefRow.primary_keyword ?? brief.opportunity.title}</h1>
      <p className="dash-page-subtitle">
        {briefRow.content_type === "CREATE_NEW_PAGE" ? "New page" : "Page update"} &middot; target: {briefRow.target_url ?? "not yet resolved"}
      </p>

      <div className="dash-card action" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4, flexWrap: "wrap" }}>
          <span className={`dash-badge ${latestJob?.status === "APPROVED" ? "success" : "info"}`}>{latestJob ? contentStatusLabel(latestJob.status) : "Not started"}</span>
          {latestQa && <span className={`dash-badge ${latestQa.passed ? "success" : "danger"}`}>Quality check {latestQa.passed ? "passed" : "failed"}</span>}
        </div>
        {showAttemptContext && latestJob && (
          <p className="dash-muted" style={{ fontSize: "0.8rem", marginTop: 0, marginBottom: 10 }}>
            {attemptContextLabel(latestJob.attempts)}
            {autoRetrying ? " — we're automatically improving this and will try again shortly." : ""}
          </p>
        )}
        {statusMessage && (
          <div className="dash-notice" style={{ marginBottom: 10 }}>
            {statusMessage}
          </div>
        )}
        {latestJob?.error && (
          <div className="dash-notice danger" style={{ marginBottom: 10 }}>
            Something went wrong while preparing the last attempt.
            <details className="dash-tech-details" style={{ marginTop: 6 }}>
              <summary>Technical details</summary>
              <div className="dash-tech-details-body">{latestJob.error}</div>
            </details>
          </div>
        )}
        <ActionGroup>
          <div className="dash-row" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {canGenerate && (
              <form action={generateContentAction}>
                <input type="hidden" name="org_slug" value={orgSlug} />
                <input type="hidden" name="content_brief_id" value={briefRow.id} />
                <SubmitButton variant="secondary" pendingLabel="Generating…">
                  {latestJob ? "Generate new attempt" : "Generate content"}
                </SubmitButton>
              </form>
            )}
            {latestJob && canReview && (
              <>
                <form action={approveContentDashboardAction}>
                  <input type="hidden" name="org_slug" value={orgSlug} />
                  <input type="hidden" name="content_job_id" value={latestJob.id} />
                  <SubmitButton variant="primary" disabled={!actions.canApprove} pendingLabel="Approving…">
                    Approve
                  </SubmitButton>
                </form>
                <form action={rejectContentDashboardAction}>
                  <input type="hidden" name="org_slug" value={orgSlug} />
                  <input type="hidden" name="content_job_id" value={latestJob.id} />
                  <ConfirmSubmitButton
                    variant="danger-outline"
                    disabled={!actions.canReject}
                    confirmTitle="Reject this draft?"
                    confirmDescription="It will be marked rejected and won't be eligible for publishing. You can always generate a new attempt afterwards."
                    confirmLabel="Reject draft"
                  >
                    Reject
                  </ConfirmSubmitButton>
                </form>
              </>
            )}
          </div>
        </ActionGroup>
        {latestJob && canRevise && (
          <form action={reviseContentAction} style={{ marginTop: 12, display: "flex", gap: 8 }}>
            <input type="hidden" name="org_slug" value={orgSlug} />
            <input type="hidden" name="content_job_id" value={latestJob.id} />
            <input type="text" name="additional_instructions" placeholder="Optional: what should change?" style={{ flex: 1 }} />
            <SubmitButton variant="secondary" pendingLabel="Requesting…">
              Request changes
            </SubmitButton>
          </form>
        )}
        {/* Phase 7.2D: same "explain the missing control" idiom 7.2B already
            shipped on Settings — canGenerate/canRevise share one EDITOR+
            floor, so one line covers both; canReview is the separate
            MANAGER+ floor and only relevant once there's a job to review. */}
        {!canEditContent(membership.role) && (
          <p className="dash-muted" style={{ fontSize: "0.82rem", marginTop: 12, marginBottom: 0 }}>
            Only Editors and above can generate or revise content — ask a teammate with that role.
          </p>
        )}
        {latestJob && !canReview && (
          <p className="dash-muted" style={{ fontSize: "0.82rem", marginTop: 8, marginBottom: 0 }}>
            Only Managers and above can approve or reject content — ask a teammate with that role.
          </p>
        )}
      </div>

      {latestVersion && (
        <div className="dash-card" style={{ marginBottom: 20 }}>
          <h2 style={{ marginTop: 0, fontSize: "1rem" }}>{(latestVersion.metadata as { seoTitle?: string }).seoTitle ?? latestVersion.title ?? "Draft"}</h2>
          <p className="dash-muted" style={{ fontSize: "0.85rem" }}>
            {(latestVersion.metadata as { metaDescription?: string }).metaDescription ?? "No meta description yet."}
          </p>
          {latestQa && !latestQa.passed && (
            <div className="dash-notice danger">
              This draft needs changes before it can be approved.
              <div style={{ marginTop: 8 }}>
                <QaIssueList issues={latestQa.issues as unknown as { severity: string; message: string }[]} />
              </div>
            </div>
          )}
          <ContentBody markdown={latestVersion.content} />
          <p className="dash-muted" style={{ fontSize: "0.78rem", marginTop: 8 }}>
            generated {fmt(latestVersion.created_at)}
          </p>
        </div>
      )}

      {!latestVersion && <EmptyState title="No draft generated yet" description="Generate content above once you're ready to see a draft for this page." />}

      <div className="dash-card action">
        <h2 style={{ marginTop: 0, fontSize: "1rem" }}>Publishing</h2>
        <p className="dash-muted" style={{ fontSize: "0.8rem", marginTop: -4 }}>
          A separate approval from the one above — approving the draft doesn&apos;t publish it. Nothing here goes live until you explicitly approve publishing to production.
        </p>
        {!connection && <p className="dash-muted">No publishing connection configured — see Settings.</p>}
        {connection && latestVersion && (
          <>
            {publication ? (
              <div style={{ marginBottom: 10 }}>
                <PublicationStepper status={publication.status} />
              </div>
            ) : (
              <p className="dash-muted" style={{ fontSize: "0.85rem" }}>
                Not yet prepared for publishing.
              </p>
            )}
            {previewAvailable && !isLive && (
              <p className="dash-muted" style={{ fontSize: "0.8rem" }}>
                These links show exactly how the page will look — nothing is public yet.
              </p>
            )}
            <p className="dash-muted" style={{ fontSize: "0.85rem" }}>
              {publication?.pull_request_url && (
                <a href={publication.pull_request_url} target="_blank" rel="noreferrer">
                  Review changes &rarr;
                </a>
              )}
              {publication?.pull_request_url && publication?.preview_url && " · "}
              {publication?.preview_url && (
                <a href={publication.preview_url} target="_blank" rel="noreferrer">
                  Preview site &rarr;
                </a>
              )}
              {(publication?.pull_request_url || publication?.preview_url) && publication?.target_url && isLive && " · "}
              {publication?.target_url && isLive && (
                <a href={publication.target_url} target="_blank" rel="noreferrer">
                  View live page &rarr;
                </a>
              )}
            </p>
            {publication?.error && (
              <div className="dash-notice danger">
                Something went wrong while publishing this page.
                <details className="dash-tech-details" style={{ marginTop: 6 }}>
                  <summary>Technical details</summary>
                  <div className="dash-tech-details-body">{publication.error}</div>
                </details>
              </div>
            )}
            <ActionGroup>
              <div className="dash-row" style={{ display: "flex", gap: 8 }}>
                {canPreparePublication(membership.role) && (
                  <form action={preparePublicationAction}>
                    <input type="hidden" name="org_slug" value={orgSlug} />
                    <input type="hidden" name="content_version_id" value={latestVersion.id} />
                    <SubmitButton variant="secondary" disabled={!canPublishNow} pendingLabel="Preparing…">
                      {publication?.status === "FAILED" ? "Retry: Prepare publication" : "Prepare publication"}
                    </SubmitButton>
                  </form>
                )}
                {canPublishToProduction(membership.role) && (
                  <form action={approveProductionMergeAction}>
                    <input type="hidden" name="org_slug" value={orgSlug} />
                    <input type="hidden" name="content_version_id" value={latestVersion.id} />
                    <ConfirmSubmitButton
                      variant="primary"
                      disabled={!canPublishNow || (connection.provider === "github" && !publication?.pull_request_number)}
                      confirmTitle="Publish this page to production?"
                      confirmDescription="This will make the website live for visitors — this is the one action in the portal that does. There's no undo button here; unpublishing afterwards is a separate, deliberate step."
                      confirmLabel="Publish to production"
                    >
                      Approve &amp; publish to production
                    </ConfirmSubmitButton>
                  </form>
                )}
              </div>
            </ActionGroup>
            <p className="dash-muted" style={{ fontSize: "0.78rem", marginTop: 8 }}>
              &quot;Prepare publication&quot; never makes the page public — it opens a preview for you to review. &quot;Approve &amp; publish&quot; is the only action that makes it live.
            </p>
            {/* Phase 7.2D: same idiom as above — canPreparePublication and
                canPublishToProduction share the same MANAGER+ floor, so one
                line covers both. */}
            {!canPreparePublication(membership.role) && !canPublishToProduction(membership.role) && (
              <p className="dash-muted" style={{ fontSize: "0.82rem", marginTop: 8 }}>
                Only Managers and above can prepare or publish content — ask a teammate with that role.
              </p>
            )}
          </>
        )}
      </div>
    </>
  );
}
