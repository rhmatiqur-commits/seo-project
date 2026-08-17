"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createOrganization } from "@/lib/db/organizations";
import { createWebsite, getWebsite, updateWebsite } from "@/lib/db/websites";
import { updateTaskStatus } from "@/lib/db/tasks";
import { triggerJob } from "@/lib/jobs/trigger";
import { processPendingJobs } from "@/lib/jobs/runner";
import { runScheduledSweep } from "@/lib/jobs/scheduler";
import { selectSearchConsoleSite, disconnectSearchConsole } from "@/lib/db/search-console";
import { updateSearchPerformanceOpportunityStatus } from "@/lib/db/search-performance";
import { assertWebsiteBelongsToOrganization, assertOwnedByOrganization } from "@/lib/api/authorize";
import { getContentBrief, getContentJob, getContentVersionById, getLatestContentVersionForJob, findActiveContentJobForBrief, insertContentJob, updateContentJobStatus } from "@/lib/db/content";
import { createContentBriefForOpportunity } from "@/lib/content/create-brief";
import { getContentProvider } from "@/lib/content/get-provider";
import { canTransitionContentJob } from "@/lib/content/state-machine";
import { upsertCmsConnection, getCmsConnectionForWebsite, markConnectionTested, getDecryptedCredential, upsertGitHubToken, selectGitHubRepository } from "@/lib/db/cms-connections";
import { getOrCreatePublicationForVersion } from "@/lib/db/content-publications";
import { recordPublicationAuditEvent } from "@/lib/db/publication-audit";
import { createPublishingProvider, buildPublishingConnectionConfig } from "@/lib/publishing/get-provider";
import { isContentApprovedForPublication } from "@/lib/publishing/eligibility";
import { recordSeoActionForCompletedTask } from "@/lib/jobs/handlers/record-seo-action";
import { acknowledgeAlert } from "@/lib/db/seo-alerts";
import type { TaskStatus, OpportunityStatus, AutonomyLevel, GithubPublicationMode } from "@/lib/supabase/types";

export async function createOrganizationAction(formData: FormData): Promise<void> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Organization name is required");
  await createOrganization(name);
  revalidatePath("/admin");
}

export async function createWebsiteAction(formData: FormData): Promise<void> {
  const organizationId = String(formData.get("organization_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const baseUrl = String(formData.get("base_url") ?? "").trim();
  const maxPages = Number(formData.get("crawl_max_pages") ?? 50) || 50;
  const maxDepth = Number(formData.get("crawl_max_depth") ?? 4) || 4;
  if (!organizationId || !name || !baseUrl) throw new Error("Missing required fields");

  await createWebsite({
    organization_id: organizationId,
    name,
    base_url: baseUrl,
    crawl_max_pages: maxPages,
    crawl_max_depth: maxDepth,
  });
  redirect(`/admin/organizations/${organizationId}`);
}

/**
 * `organizationIdHint` comes from a hidden form field — client-controlled,
 * not trusted at face value. The real organization_id is always derived
 * from the website row itself (assertWebsiteBelongsToOrganization throws if
 * the hint doesn't match, rather than silently using the mismatched value) —
 * same derive-from-the-resource pattern every app/api/** trigger route
 * already uses. See SECURITY_AUDIT.md.
 */
async function triggerAndReturn(
  websiteId: string,
  organizationIdHint: string,
  jobType:
    | "CRAWL_WEBSITE"
    | "RUN_SEO_AUDIT"
    | "GENERATE_SEO_OPPORTUNITIES"
    | "KEYWORD_DISCOVERY"
    | "SEARCH_CONSOLE_SYNC"
    | "ANALYSE_SEARCH_PERFORMANCE"
    | "FETCH_SERP_RESULTS"
    | "ANALYSE_ACTION_OUTCOMES"
) {
  const website = await getWebsite(websiteId);
  const organizationId = assertWebsiteBelongsToOrganization(website, organizationIdHint, websiteId);

  await triggerJob({
    organizationId,
    websiteId,
    jobType,
    idempotencyKey: `${jobType}:${websiteId}`,
  });
  revalidatePath(`/admin/websites/${websiteId}`);
  revalidatePath(`/admin/websites/${websiteId}/keywords`);
  revalidatePath(`/admin/websites/${websiteId}/search-console`);
  revalidatePath(`/admin/websites/${websiteId}/search-performance`);
  revalidatePath(`/admin/websites/${websiteId}/competitors`);
  revalidatePath(`/admin/websites/${websiteId}/outcomes`);
}

export async function triggerCrawlAction(formData: FormData): Promise<void> {
  const websiteId = String(formData.get("website_id"));
  const organizationId = String(formData.get("organization_id"));
  await triggerAndReturn(websiteId, organizationId, "CRAWL_WEBSITE");
  redirect(`/admin/websites/${websiteId}`);
}

export async function triggerAuditAction(formData: FormData): Promise<void> {
  const websiteId = String(formData.get("website_id"));
  const organizationId = String(formData.get("organization_id"));
  await triggerAndReturn(websiteId, organizationId, "RUN_SEO_AUDIT");
  redirect(`/admin/websites/${websiteId}`);
}

export async function triggerOpportunitiesAction(formData: FormData): Promise<void> {
  const websiteId = String(formData.get("website_id"));
  const organizationId = String(formData.get("organization_id"));
  await triggerAndReturn(websiteId, organizationId, "GENERATE_SEO_OPPORTUNITIES");
  redirect(`/admin/websites/${websiteId}`);
}

export async function triggerKeywordDiscoveryAction(formData: FormData): Promise<void> {
  const websiteId = String(formData.get("website_id"));
  const organizationId = String(formData.get("organization_id"));
  await triggerAndReturn(websiteId, organizationId, "KEYWORD_DISCOVERY");
  redirect(`/admin/websites/${websiteId}/keywords`);
}

export async function triggerSearchConsoleSyncAction(formData: FormData): Promise<void> {
  const websiteId = String(formData.get("website_id"));
  const organizationId = String(formData.get("organization_id"));
  await triggerAndReturn(websiteId, organizationId, "SEARCH_CONSOLE_SYNC");
  redirect(`/admin/websites/${websiteId}/search-console`);
}

export async function triggerSearchPerformanceAnalysisAction(formData: FormData): Promise<void> {
  const websiteId = String(formData.get("website_id"));
  const organizationId = String(formData.get("organization_id"));
  await triggerAndReturn(websiteId, organizationId, "ANALYSE_SEARCH_PERFORMANCE");
  redirect(`/admin/websites/${websiteId}/search-performance`);
}

export async function triggerSerpFetchAction(formData: FormData): Promise<void> {
  const websiteId = String(formData.get("website_id"));
  const organizationId = String(formData.get("organization_id"));
  await triggerAndReturn(websiteId, organizationId, "FETCH_SERP_RESULTS");
  redirect(`/admin/websites/${websiteId}/competitors`);
}

export async function triggerActionOutcomesAnalysisAction(formData: FormData): Promise<void> {
  const websiteId = String(formData.get("website_id"));
  const organizationId = String(formData.get("organization_id"));
  await triggerAndReturn(websiteId, organizationId, "ANALYSE_ACTION_OUTCOMES");
  redirect(`/admin/websites/${websiteId}/outcomes`);
}

export async function updateAutonomyLevelAction(formData: FormData): Promise<void> {
  const websiteId = String(formData.get("website_id"));
  const autonomyLevel = String(formData.get("autonomy_level")) as AutonomyLevel;
  await updateWebsite(websiteId, { autonomy_level: autonomyLevel });
  revalidatePath(`/admin/websites/${websiteId}/outcomes`);
  redirect(`/admin/websites/${websiteId}/outcomes`);
}

export async function acknowledgeAlertAction(formData: FormData): Promise<void> {
  const alertId = String(formData.get("alert_id"));
  const websiteId = String(formData.get("website_id"));
  await acknowledgeAlert(alertId);
  revalidatePath(`/admin/websites/${websiteId}/outcomes`);
  redirect(`/admin/websites/${websiteId}/outcomes`);
}

/** Sets the free-text SERP location used for this website's future SERP
 * requests (e.g. "Coventry,England,United Kingdom") — local SEO matters,
 * results are not globally interchangeable. */
export async function updateSerpLocationAction(formData: FormData): Promise<void> {
  const websiteId = String(formData.get("website_id"));
  const location = String(formData.get("default_serp_location") ?? "").trim();
  await updateWebsite(websiteId, { default_serp_location: location || null });
  revalidatePath(`/admin/websites/${websiteId}/competitors`);
  redirect(`/admin/websites/${websiteId}/competitors`);
}

/** Sets the business-fact fields the content brief reads (Phase 4) —
 * business_description/target_audience/brand_voice/content_constraints.
 * Blank fields are stored as null, never a placeholder string; the brief
 * builder surfaces a null field as an explicit missingBusinessInfo entry
 * rather than inventing one (see lib/content/build-brief.ts). */
export async function updateContentProfileAction(formData: FormData): Promise<void> {
  const websiteId = String(formData.get("website_id"));
  const businessDescription = String(formData.get("business_description") ?? "").trim();
  const targetAudience = String(formData.get("target_audience") ?? "").trim();
  const brandVoice = String(formData.get("brand_voice") ?? "").trim();
  const contentConstraints = String(formData.get("content_constraints") ?? "").trim();
  await updateWebsite(websiteId, {
    business_description: businessDescription || null,
    target_audience: targetAudience || null,
    brand_voice: brandVoice || null,
    content_constraints: contentConstraints || null,
  });
  revalidatePath(`/admin/websites/${websiteId}/content`);
  redirect(`/admin/websites/${websiteId}/content`);
}

export async function updateSearchPerformanceOpportunityStatusAction(formData: FormData): Promise<void> {
  const opportunityId = String(formData.get("opportunity_id"));
  const websiteId = String(formData.get("website_id"));
  const status = String(formData.get("status")) as OpportunityStatus;
  await updateSearchPerformanceOpportunityStatus(opportunityId, status);
  revalidatePath(`/admin/websites/${websiteId}/search-performance`);
  redirect(`/admin/websites/${websiteId}/search-performance`);
}

export async function selectSearchConsoleSiteAction(formData: FormData): Promise<void> {
  const websiteId = String(formData.get("website_id"));
  const siteUrl = String(formData.get("site_url"));
  if (!siteUrl) throw new Error("Choose a Search Console property");
  await selectSearchConsoleSite(websiteId, siteUrl);
  revalidatePath(`/admin/websites/${websiteId}/search-console`);
  redirect(`/admin/websites/${websiteId}/search-console`);
}

export async function disconnectSearchConsoleAction(formData: FormData): Promise<void> {
  const websiteId = String(formData.get("website_id"));
  await disconnectSearchConsole(websiteId);
  revalidatePath(`/admin/websites/${websiteId}/search-console`);
  redirect(`/admin/websites/${websiteId}/search-console`);
}

export async function updateTaskStatusAction(formData: FormData): Promise<void> {
  const taskId = String(formData.get("task_id"));
  const websiteId = String(formData.get("website_id"));
  const status = String(formData.get("status")) as TaskStatus;
  await updateTaskStatus(taskId, status);
  // Phase 6: a task completing is the "action executed" moment for actions
  // that never go through the content pipeline (TECHNICAL_FIX,
  // IMPROVE_INTERNAL_LINKING, ...) — see
  // lib/jobs/handlers/record-seo-action.ts's recordSeoActionForCompletedTask
  // for why content-eligible tasks are deliberately skipped here. Soft-
  // failed: bookkeeping for future measurement must never block marking a
  // task done.
  if (status === "completed") {
    await recordSeoActionForCompletedTask(taskId).catch((error) => {
      console.warn(`[admin] failed to record seo_action for completed task ${taskId}, continuing:`, error);
    });
  }
  redirect(`/admin/websites/${websiteId}`);
}

/** Manual-testing control: runs the exact same sweep the scheduled cron
 * workflow calls (lib/jobs/scheduler.ts), in-process — no HTTP round trip or
 * CRON_SECRET needed since this only runs from an already-authenticated
 * (Basic Auth via proxy.ts) admin page. */
export async function runSchedulerAction(): Promise<void> {
  await runScheduledSweep();
  revalidatePath("/admin/automation");
  redirect("/admin/automation");
}

/** Manual-testing control: drains PENDING jobs without running the
 * scheduler's due-website/retry/stale-recovery phases. */
export async function processPendingJobsAction(): Promise<void> {
  await processPendingJobs();
  revalidatePath("/admin/automation");
  redirect("/admin/automation");
}

// ---------------------------------------------------------------------------
// Content Execution (Phase 4). content_briefs/content_jobs are their own
// resources (not website_id-keyed the way triggerAndReturn's jobs are) — see
// SECURITY_AUDIT.md's derive-organization_id-from-the-resource pattern,
// applied here via the generalised assertOwnedByOrganization.
// ---------------------------------------------------------------------------

/** Builds a content brief from an eligible seo_opportunities row
 * (CREATE_NEW_PAGE/OPTIMISE_EXISTING_PAGE only — createContentBriefForOpportunity
 * throws otherwise) and redirects to its review page. Synchronous: brief
 * assembly is a pure read+compute, no AI call (see lib/content/create-brief.ts). */
export async function createContentBriefAction(formData: FormData): Promise<void> {
  const opportunityId = String(formData.get("opportunity_id"));
  const websiteId = String(formData.get("website_id"));
  const organizationId = String(formData.get("organization_id"));

  const website = await getWebsite(websiteId);
  assertWebsiteBelongsToOrganization(website, organizationId, websiteId);

  const brief = await createContentBriefForOpportunity(opportunityId);
  revalidatePath(`/admin/websites/${websiteId}/content`);
  redirect(`/admin/websites/${websiteId}/content/${brief.id}`);
}

/** Starts (or resumes into) content generation for a brief: creates a
 * content_jobs row if none is currently active for it (duplicate-generation
 * prevention — see lib/db/content.ts's findActiveContentJobForBrief) and
 * triggers GENERATE_CONTENT, scoped to that content_job_id. */
export async function generateContentAction(formData: FormData): Promise<void> {
  const contentBriefId = String(formData.get("content_brief_id"));
  const websiteId = String(formData.get("website_id"));
  const organizationId = String(formData.get("organization_id"));

  const brief = await getContentBrief(contentBriefId);
  assertOwnedByOrganization(brief, organizationId, "ContentBrief", contentBriefId);

  const active = await findActiveContentJobForBrief(contentBriefId);
  const contentJob = active ?? (await insertContentJob({ organizationId, websiteId, contentBriefId, provider: getContentProvider().name }));

  await triggerJob({
    organizationId,
    websiteId,
    jobType: "GENERATE_CONTENT",
    payload: { content_job_id: contentJob.id },
    idempotencyKey: `GENERATE_CONTENT:${contentJob.id}`,
  });
  revalidatePath(`/admin/websites/${websiteId}/content/${contentBriefId}`);
  redirect(`/admin/websites/${websiteId}/content/${contentBriefId}`);
}

/** Manually (re-)triggers QA_CONTENT for a content_job currently awaiting
 * QA on its latest version — mirrors what GENERATE_CONTENT/REVISE_CONTENT
 * already chain into automatically, exposed as a recovery/testing control. */
export async function runContentQaAction(formData: FormData): Promise<void> {
  const contentJobId = String(formData.get("content_job_id"));
  const websiteId = String(formData.get("website_id"));
  const organizationId = String(formData.get("organization_id"));

  const contentJob = await getContentJob(contentJobId);
  assertOwnedByOrganization(contentJob, organizationId, "ContentJob", contentJobId);
  if (contentJob!.status !== "QA_PENDING") throw new Error(`content_job ${contentJobId} is not awaiting QA (status: ${contentJob!.status}).`);

  await triggerJob({
    organizationId,
    websiteId,
    jobType: "QA_CONTENT",
    payload: { content_job_id: contentJobId },
    idempotencyKey: `QA_CONTENT:${contentJobId}`,
  });
  revalidatePath(`/admin/websites/${websiteId}/content/${contentJob!.content_brief_id}`);
  redirect(`/admin/websites/${websiteId}/content/${contentJob!.content_brief_id}`);
}

/** Human-triggered revision — valid from QA_FAILED (the automatic path also
 * uses this handler), NEEDS_REVIEW, or READY_FOR_APPROVAL (explicit
 * override, per lib/content/state-machine.ts). Optional free-text
 * instructions are merged into the AI revision prompt alongside the latest
 * QA feedback. */
export async function reviseContentAction(formData: FormData): Promise<void> {
  const contentJobId = String(formData.get("content_job_id"));
  const websiteId = String(formData.get("website_id"));
  const organizationId = String(formData.get("organization_id"));
  const additionalInstructions = String(formData.get("additional_instructions") ?? "").trim();

  const contentJob = await getContentJob(contentJobId);
  assertOwnedByOrganization(contentJob, organizationId, "ContentJob", contentJobId);
  if (!canTransitionContentJob(contentJob!.status, "QA_PENDING")) {
    throw new Error(`content_job ${contentJobId} cannot be revised from status ${contentJob!.status}.`);
  }

  await triggerJob({
    organizationId,
    websiteId,
    jobType: "REVISE_CONTENT",
    payload: { content_job_id: contentJobId, ...(additionalInstructions ? { additional_instructions: additionalInstructions } : {}) },
    idempotencyKey: `REVISE_CONTENT:${contentJobId}`,
  });
  revalidatePath(`/admin/websites/${websiteId}/content/${contentJob!.content_brief_id}`);
  redirect(`/admin/websites/${websiteId}/content/${contentJob!.content_brief_id}`);
}

/** Phase 4's approval is terminal here — "approved for Phase 5 publishing,"
 * never an automatic publish. */
export async function approveContentAction(formData: FormData): Promise<void> {
  const contentJobId = String(formData.get("content_job_id"));
  const websiteId = String(formData.get("website_id"));
  const organizationId = String(formData.get("organization_id"));

  const contentJob = await getContentJob(contentJobId);
  assertOwnedByOrganization(contentJob, organizationId, "ContentJob", contentJobId);
  if (!canTransitionContentJob(contentJob!.status, "APPROVED")) {
    throw new Error(`content_job ${contentJobId} cannot be approved from status ${contentJob!.status}.`);
  }

  await updateContentJobStatus(contentJobId, "APPROVED", { completedAt: new Date().toISOString() });

  // Additive audit-log write (Phase 5) — "who approved" is now recorded
  // ready for Phase 5's publishing actions to reference. Best-effort: a
  // missing version here would be unusual, not a reason to fail the approval
  // itself, so this only logs when one is actually found.
  const approvedVersion = await getLatestContentVersionForJob(contentJobId);
  if (approvedVersion) {
    await recordPublicationAuditEvent({
      organizationId: contentJob!.organization_id,
      websiteId: contentJob!.website_id,
      contentVersionId: approvedVersion.id,
      action: "CONTENT_APPROVED",
      result: "success",
    });
  }

  revalidatePath(`/admin/websites/${websiteId}/content/${contentJob!.content_brief_id}`);
  redirect(`/admin/websites/${websiteId}/content/${contentJob!.content_brief_id}`);
}

export async function rejectContentAction(formData: FormData): Promise<void> {
  const contentJobId = String(formData.get("content_job_id"));
  const websiteId = String(formData.get("website_id"));
  const organizationId = String(formData.get("organization_id"));

  const contentJob = await getContentJob(contentJobId);
  assertOwnedByOrganization(contentJob, organizationId, "ContentJob", contentJobId);
  if (!canTransitionContentJob(contentJob!.status, "REJECTED")) {
    throw new Error(`content_job ${contentJobId} cannot be rejected from status ${contentJob!.status}.`);
  }

  await updateContentJobStatus(contentJobId, "REJECTED", { completedAt: new Date().toISOString() });
  revalidatePath(`/admin/websites/${websiteId}/content/${contentJob!.content_brief_id}`);
  redirect(`/admin/websites/${websiteId}/content/${contentJob!.content_brief_id}`);
}

// ---------------------------------------------------------------------------
// Publishing Engine (Phase 5). Every action re-derives organization_id from
// the resource itself (assertWebsiteBelongsToOrganization /
// assertOwnedByOrganization — SECURITY_AUDIT.md's pattern) and — for
// createDraftAction/publishContentAction — re-checks APPROVED status
// server-side even though the job handler re-checks it again too (defence
// in depth, and a fast/clear rejection before a job is even queued).
// ---------------------------------------------------------------------------

/** Connects (or re-connects, overwriting the stored credential) a
 * website's CMS. The Application Password is encrypted via Supabase Vault
 * before it ever touches a table (see lib/db/cms-connections.ts) — this
 * action never logs it and never returns it in any response. */
export async function connectCmsAction(formData: FormData): Promise<void> {
  const websiteId = String(formData.get("website_id"));
  const organizationId = String(formData.get("organization_id"));
  const baseUrl = String(formData.get("base_url") ?? "").trim();
  const username = String(formData.get("username") ?? "").trim();
  const applicationPassword = String(formData.get("application_password") ?? "");
  if (!baseUrl || !username || !applicationPassword) {
    throw new Error("WordPress site URL, username, and Application Password are all required.");
  }

  const website = await getWebsite(websiteId);
  const realOrganizationId = assertWebsiteBelongsToOrganization(website, organizationId, websiteId);

  await upsertCmsConnection({ organizationId: realOrganizationId, websiteId, baseUrl, username, applicationPassword });
  revalidatePath(`/admin/websites/${websiteId}/publishing`);
  redirect(`/admin/websites/${websiteId}/publishing`);
}

export async function testCmsConnectionAction(formData: FormData): Promise<void> {
  const websiteId = String(formData.get("website_id"));
  const organizationId = String(formData.get("organization_id"));

  const website = await getWebsite(websiteId);
  assertWebsiteBelongsToOrganization(website, organizationId, websiteId);

  const connection = await getCmsConnectionForWebsite(websiteId);
  if (!connection) throw new Error("No CMS connection is configured for this website yet.");

  const decryptedSecret = await getDecryptedCredential(connection.credential_secret_id);
  const provider = createPublishingProvider(buildPublishingConnectionConfig(connection, decryptedSecret));
  const result = await provider.testConnection();
  await markConnectionTested(connection.id, result.ok, result.ok ? null : result.message);

  revalidatePath(`/admin/websites/${websiteId}/publishing`);
  redirect(`/admin/websites/${websiteId}/publishing`);
}

/** Shared by createDraftAction/publishContentAction: every re-check the job
 * handler will also perform, done here first so a bad request never even
 * reaches the job queue. */
async function loadApprovedPublicationTarget(formData: FormData) {
  const versionId = String(formData.get("content_version_id"));
  const websiteId = String(formData.get("website_id"));
  const organizationId = String(formData.get("organization_id"));

  const website = await getWebsite(websiteId);
  const realOrganizationId = assertWebsiteBelongsToOrganization(website, organizationId, websiteId);

  const version = await getContentVersionById(versionId);
  assertOwnedByOrganization(version, realOrganizationId, "ContentVersion", versionId);

  const contentJob = await getContentJob(version!.content_job_id);
  if (!contentJob || !isContentApprovedForPublication(contentJob.status)) {
    throw new Error(`Content must be APPROVED before publishing (current status: ${contentJob?.status ?? "unknown"}).`);
  }

  const brief = await getContentBrief(version!.content_brief_id);
  if (!brief) throw new Error("Content brief not found.");

  const publication = await getOrCreatePublicationForVersion({
    organizationId: realOrganizationId,
    websiteId,
    contentVersionId: versionId,
    publicationType: brief.content_type as "CREATE_NEW_PAGE" | "OPTIMISE_EXISTING_PAGE",
    targetUrl: brief.target_url,
  });

  return { versionId, websiteId, organizationId: realOrganizationId, briefId: brief.id, publicationId: publication.id };
}

/** Publishes to the connected CMS as a draft — never publicly visible (see
 * lib/publishing/wordpress-provider.ts's createDraft). Also doubles as the
 * "Retry" action when the last attempt FAILED — the job's own
 * retry-strategy logic (lib/publishing/retry-strategy.ts) decides whether
 * to adopt an already-created page instead of making a duplicate. */
export async function createDraftAction(formData: FormData): Promise<void> {
  const { websiteId, organizationId, briefId, publicationId } = await loadApprovedPublicationTarget(formData);
  await triggerJob({
    organizationId,
    websiteId,
    jobType: "CREATE_DRAFT",
    payload: { content_publication_id: publicationId },
    idempotencyKey: `CREATE_DRAFT:${formData.get("content_version_id")}`,
  });
  revalidatePath(`/admin/websites/${websiteId}/content/${briefId}`);
  redirect(`/admin/websites/${websiteId}/content/${briefId}`);
}

/** The only action that can make content publicly visible on a
 * WordPress-connected website. Also doubles as "Retry Failed Publication"
 * when the last attempt FAILED. For a GitHub-connected website, this button
 * is not shown at all — see mergeToProductionAction below, a deliberately
 * distinct operation (Phase 6A). */
export async function publishContentAction(formData: FormData): Promise<void> {
  const { websiteId, organizationId, briefId, publicationId } = await loadApprovedPublicationTarget(formData);
  await triggerJob({
    organizationId,
    websiteId,
    jobType: "PUBLISH_CONTENT",
    payload: { content_publication_id: publicationId },
    idempotencyKey: `PUBLISH_CONTENT:${formData.get("content_version_id")}`,
  });
  revalidatePath(`/admin/websites/${websiteId}/content/${briefId}`);
  redirect(`/admin/websites/${websiteId}/content/${briefId}`);
}

// ---------------------------------------------------------------------------
// GitHub/Vercel Publishing Provider (Phase 6A). connectGitHubTokenAction/
// selectGitHubRepositoryAction extend the same cms_connections
// architecture connectCmsAction/testCmsConnectionAction already use — see
// lib/db/cms-connections.ts's upsertGitHubToken/selectGitHubRepository.
// ---------------------------------------------------------------------------

/** Step 1 of connecting a GitHub-based website: save a repository-scoped
 * Personal Access Token (encrypted via the same Supabase Vault mechanism as
 * WordPress's Application Password — never a plaintext column, never
 * returned in any response). Moves the connection to
 * 'pending_repo_selection' — the admin still has to pick a repository next
 * (see the RepoPicker component on the Publishing page). */
export async function connectGitHubTokenAction(formData: FormData): Promise<void> {
  const websiteId = String(formData.get("website_id"));
  const organizationId = String(formData.get("organization_id"));
  const token = String(formData.get("token") ?? "").trim();
  if (!token) throw new Error("A GitHub personal access token is required.");

  const website = await getWebsite(websiteId);
  const realOrganizationId = assertWebsiteBelongsToOrganization(website, organizationId, websiteId);

  await upsertGitHubToken({ organizationId: realOrganizationId, websiteId, token });
  revalidatePath(`/admin/websites/${websiteId}/publishing`);
  redirect(`/admin/websites/${websiteId}/publishing`);
}

/** Step 2: the admin's repository/branch/mode choice, from a live-listed set
 * the Publishing page's RepoPicker fetched during render — never a
 * manually-typed URL (spec: "do not require the user to manually enter a
 * repository URL if the GitHub API can provide it"). */
export async function selectGitHubRepositoryAction(formData: FormData): Promise<void> {
  const websiteId = String(formData.get("website_id"));
  const repoFullName = String(formData.get("repo_full_name") ?? "");
  const productionBranch = String(formData.get("production_branch") ?? "").trim();
  const publicationMode = String(formData.get("publication_mode") ?? "GITHUB_PULL_REQUEST") as GithubPublicationMode;
  const accountLogin = String(formData.get("account_login") ?? "");
  const [owner, repo] = repoFullName.split("/");
  if (!owner || !repo || !productionBranch) throw new Error("Choose a repository and production branch.");

  await selectGitHubRepository({ websiteId, owner, repo, productionBranch, publicationMode, accountLogin });
  revalidatePath(`/admin/websites/${websiteId}/publishing`);
  redirect(`/admin/websites/${websiteId}/publishing`);
}

/** The only action that can merge a GitHub pull request into the production
 * branch — the git-flow equivalent of publishContentAction, kept as a
 * genuinely distinct operation (spec: "Production merge must require
 * explicit user action initially. Add MERGE_TO_PRODUCTION as a distinct
 * operation"). Every re-check (content APPROVED, connection valid, PR
 * exists and is mergeable) happens server-side in the job handler
 * (lib/jobs/handlers/merge-to-production.ts) against live database/GitHub
 * state — never trusted from this form. */
export async function mergeToProductionAction(formData: FormData): Promise<void> {
  const { websiteId, organizationId, briefId, publicationId } = await loadApprovedPublicationTarget(formData);
  await triggerJob({
    organizationId,
    websiteId,
    jobType: "MERGE_TO_PRODUCTION",
    payload: { content_publication_id: publicationId },
    idempotencyKey: `MERGE_TO_PRODUCTION:${formData.get("content_version_id")}`,
  });
  revalidatePath(`/admin/websites/${websiteId}/content/${briefId}`);
  redirect(`/admin/websites/${websiteId}/content/${briefId}`);
}
