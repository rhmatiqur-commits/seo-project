"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrganizationMembership, PermissionError } from "@/lib/auth/session";
import { assertOwnedByOrganization } from "@/lib/api/authorize";
import { getOpportunity, updateOpportunityStatus } from "@/lib/db/opportunities";
import { getTaskForOpportunity, insertTask, getTask, updateTaskStatus } from "@/lib/db/tasks";
import { recordSeoActionForCompletedTask } from "@/lib/jobs/handlers/record-seo-action";
import { triggerJob } from "@/lib/jobs/trigger";
import {
  getContentBrief,
  getContentBriefBySeoOpportunityId,
  getContentJob,
  getContentVersionById,
  getLatestContentVersionForJob,
  findActiveContentJobForBrief,
  insertContentJob,
  updateContentJobStatus,
} from "@/lib/db/content";
import { createContentBriefForOpportunity } from "@/lib/content/create-brief";
import { isContentEligibleOpportunityType } from "@/lib/content/eligibility";
import { getContentProvider } from "@/lib/content/get-provider";
import { canTransitionContentJob } from "@/lib/content/state-machine";
import { recordPublicationAuditEvent } from "@/lib/db/publication-audit";
import { getOrCreatePublicationForVersion } from "@/lib/db/content-publications";
import { getCmsConnectionForWebsite, upsertGitHubToken, selectGitHubRepository, markConnectionTested, getDecryptedCredential } from "@/lib/db/cms-connections";
import { selectSearchConsoleSite, disconnectSearchConsole } from "@/lib/db/search-console";
import { createPublishingProvider, buildPublishingConnectionConfig } from "@/lib/publishing/get-provider";
import { insertInvitation, getInvitationById, revokeInvitation } from "@/lib/db/invitations";
import { getMembershipById, deleteMembership, updateMembershipRole, countOwners } from "@/lib/db/memberships";
import { canApproveContent, canEditContent, canPreparePublication, canPublishToProduction, canManageIntegrations, canManageUsers } from "@/lib/auth/permissions";
import { getPrimaryWebsiteForOrganization } from "@/lib/dashboard/website";
import type { TaskStatus, GithubPublicationMode, GithubContentAdapter, MembershipRole } from "@/lib/supabase/types";

/**
 * Every action in this file follows the same shape: (1) verify the
 * signed-in user's membership + minimum role for the organisation the form
 * claims to act on — `requireOrganizationMembership` derives that
 * organisation from the *session*, never trusts it from form data; (2)
 * re-verify the specific resource (opportunity/task/etc.) actually belongs
 * to that same organisation via `assertOwnedByOrganization` (the exact IDOR
 * guard every app/api/** route and app/admin/actions.ts already uses) —
 * stronger here than in admin, since the "expected" organisation id is
 * derived from a verified session+membership rather than a merely
 * client-supplied hidden field being cross-checked; (3) only then call the
 * existing lib/db and lib/jobs functions — the exact same underlying
 * services app/admin/actions.ts calls, never a parallel implementation.
 */

// ---------------------------------------------------------------------------
// Opportunities
// ---------------------------------------------------------------------------

/** "Accept" an opportunity: marks it approved and creates the corresponding
 * seo_tasks row if one doesn't already exist (idempotent — a second click
 * never creates a duplicate task, mirrors every other promotion path in
 * this codebase's own duplicate-prevention convention). */
export async function acceptOpportunityAction(formData: FormData): Promise<void> {
  const orgSlug = String(formData.get("org_slug"));
  const opportunityId = String(formData.get("opportunity_id"));
  const { organization } = await requireOrganizationMembership(orgSlug, "MANAGER");

  const opportunity = await getOpportunity(opportunityId);
  assertOwnedByOrganization(opportunity, organization.id, "Opportunity", opportunityId);

  await updateOpportunityStatus(opportunityId, "approved");

  const existingTask = await getTaskForOpportunity(opportunityId);
  if (!existingTask) {
    await insertTask({
      organization_id: opportunity!.organization_id,
      website_id: opportunity!.website_id,
      opportunity_id: opportunity!.id,
      title: opportunity!.title,
      description: opportunity!.description,
      type: opportunity!.type,
      priority: Math.round(opportunity!.priority_score),
    });
  }

  revalidatePath(`/dashboard/${orgSlug}/opportunities`);
  revalidatePath(`/dashboard/${orgSlug}/tasks`);
  redirect(`/dashboard/${orgSlug}/opportunities`);
}

export async function dismissOpportunityAction(formData: FormData): Promise<void> {
  const orgSlug = String(formData.get("org_slug"));
  const opportunityId = String(formData.get("opportunity_id"));
  const { organization } = await requireOrganizationMembership(orgSlug, "MANAGER");

  const opportunity = await getOpportunity(opportunityId);
  assertOwnedByOrganization(opportunity, organization.id, "Opportunity", opportunityId);

  await updateOpportunityStatus(opportunityId, "rejected");
  revalidatePath(`/dashboard/${orgSlug}/opportunities`);
  redirect(`/dashboard/${orgSlug}/opportunities`);
}

/**
 * Phase 7.1E: the first client-facing trigger for content_briefs creation —
 * every prior caller of createContentBriefForOpportunity was admin-only
 * (app/admin/actions.ts's createContentBriefAction). Named
 * *Dashboard*Action, not createContentBriefAction, so its export can never
 * collide with admin's identically-purposed action the way
 * updateTaskStatusAction/generateContentAction/reviseContentAction did
 * before the 7.1D Server Action manifest fix.
 *
 * Duplicate-creation safeguard: content_briefs has no unique constraint on
 * seo_opportunity_id (nothing before this action ever needed one — the
 * only prior caller was a single admin form with no retry path), so this
 * is a find-or-create using the column's own existing index
 * (content_briefs_seo_opportunity_id_idx) via
 * getContentBriefBySeoOpportunityId — the same idiom
 * getOrCreatePublicationForVersion/findActiveContentJobForBrief already use
 * elsewhere in this file. A second click (or a second tab) never creates a
 * second brief; it just lands on the one that already exists.
 */
export async function createContentBriefDashboardAction(formData: FormData): Promise<void> {
  const orgSlug = String(formData.get("org_slug"));
  const opportunityId = String(formData.get("opportunity_id"));
  const { organization, membership } = await requireOrganizationMembership(orgSlug, "EDITOR");
  if (!canEditContent(membership.role)) throw new PermissionError("You don't have permission to create content.");

  const opportunity = await getOpportunity(opportunityId);
  assertOwnedByOrganization(opportunity, organization.id, "Opportunity", opportunityId);
  if (opportunity!.status !== "approved") {
    throw new Error("This opportunity must be accepted before content can be created for it.");
  }
  if (!isContentEligibleOpportunityType(opportunity!.type)) {
    throw new Error(`Opportunity type ${opportunity!.type} does not support content creation.`);
  }

  const existingBrief = await getContentBriefBySeoOpportunityId(opportunityId);
  const brief = existingBrief ?? (await createContentBriefForOpportunity(opportunityId));

  revalidatePath(`/dashboard/${orgSlug}/opportunities/${opportunityId}`);
  revalidatePath(`/dashboard/${orgSlug}/content`);
  redirect(`/dashboard/${orgSlug}/content/${brief.id}`);
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

const VALID_TASK_STATUSES: readonly TaskStatus[] = ["pending", "in_progress", "completed", "cancelled"];

export async function updateTaskStatusAction(formData: FormData): Promise<void> {
  const orgSlug = String(formData.get("org_slug"));
  const taskId = String(formData.get("task_id"));
  const status = String(formData.get("status")) as TaskStatus;
  if (!VALID_TASK_STATUSES.includes(status)) throw new Error(`Invalid task status: ${status}`);

  const { organization } = await requireOrganizationMembership(orgSlug, "MANAGER");
  const task = await getTask(taskId);
  assertOwnedByOrganization(task, organization.id, "Task", taskId);

  await updateTaskStatus(taskId, status);

  // Same Phase 6 hook app/admin/actions.ts's updateTaskStatusAction uses —
  // one action-recording code path regardless of which UI marked the task
  // completed. Soft-failed: this bookkeeping must never block the status update.
  if (status === "completed") {
    await recordSeoActionForCompletedTask(taskId).catch((error) => {
      console.warn(`[dashboard] failed to record seo_action for completed task ${taskId}, continuing:`, error);
    });
  }

  revalidatePath(`/dashboard/${orgSlug}/tasks`);
  redirect(`/dashboard/${orgSlug}/tasks`);
}

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

export async function generateContentAction(formData: FormData): Promise<void> {
  const orgSlug = String(formData.get("org_slug"));
  const contentBriefId = String(formData.get("content_brief_id"));
  const { organization, membership } = await requireOrganizationMembership(orgSlug, "EDITOR");
  if (!canEditContent(membership.role)) throw new PermissionError("You don't have permission to generate content.");

  const brief = await getContentBrief(contentBriefId);
  assertOwnedByOrganization(brief, organization.id, "ContentBrief", contentBriefId);

  const active = await findActiveContentJobForBrief(contentBriefId);
  const contentJob = active ?? (await insertContentJob({ organizationId: organization.id, websiteId: brief!.website_id, contentBriefId, provider: getContentProvider().name }));

  await triggerJob({
    organizationId: organization.id,
    websiteId: brief!.website_id,
    jobType: "GENERATE_CONTENT",
    payload: { content_job_id: contentJob.id },
    idempotencyKey: `GENERATE_CONTENT:${contentJob.id}`,
  });
  revalidatePath(`/dashboard/${orgSlug}/content/${contentBriefId}`);
  redirect(`/dashboard/${orgSlug}/content/${contentBriefId}`);
}

export async function reviseContentAction(formData: FormData): Promise<void> {
  const orgSlug = String(formData.get("org_slug"));
  const contentJobId = String(formData.get("content_job_id"));
  const additionalInstructions = String(formData.get("additional_instructions") ?? "").trim();
  const { organization, membership } = await requireOrganizationMembership(orgSlug, "EDITOR");
  if (!canEditContent(membership.role)) throw new PermissionError("You don't have permission to request changes.");

  const contentJob = await getContentJob(contentJobId);
  assertOwnedByOrganization(contentJob, organization.id, "ContentJob", contentJobId);
  if (!canTransitionContentJob(contentJob!.status, "QA_PENDING")) {
    throw new Error(`Content cannot be revised from its current status (${contentJob!.status}).`);
  }

  await triggerJob({
    organizationId: organization.id,
    websiteId: contentJob!.website_id,
    jobType: "REVISE_CONTENT",
    payload: { content_job_id: contentJobId, ...(additionalInstructions ? { additional_instructions: additionalInstructions } : {}) },
    idempotencyKey: `REVISE_CONTENT:${contentJobId}`,
  });
  revalidatePath(`/dashboard/${orgSlug}/content/${contentJob!.content_brief_id}`);
  redirect(`/dashboard/${orgSlug}/content/${contentJob!.content_brief_id}`);
}

/** The one action in this whole file with the highest stakes: this is what
 * makes content eligible to eventually go live. MANAGER+ only
 * (canApproveContent) — never EDITOR, matching the spec's permission table
 * exactly. */
export async function approveContentDashboardAction(formData: FormData): Promise<void> {
  const orgSlug = String(formData.get("org_slug"));
  const contentJobId = String(formData.get("content_job_id"));
  const { organization, membership, user } = await requireOrganizationMembership(orgSlug, "MANAGER");
  if (!canApproveContent(membership.role)) throw new PermissionError("You don't have permission to approve content.");

  const contentJob = await getContentJob(contentJobId);
  assertOwnedByOrganization(contentJob, organization.id, "ContentJob", contentJobId);
  if (!canTransitionContentJob(contentJob!.status, "APPROVED")) {
    throw new Error(`Content cannot be approved from its current status (${contentJob!.status}).`);
  }

  await updateContentJobStatus(contentJobId, "APPROVED", { completedAt: new Date().toISOString() });

  const approvedVersion = await getLatestContentVersionForJob(contentJobId);
  if (approvedVersion) {
    // Phase 7.2B: the only recordPublicationAuditEvent call site that runs
    // synchronously inside a live, authenticated request — the real signed-in
    // user is right here, so this is the one event that can honestly say who
    // acted, rather than falling back to the shared "admin" placeholder.
    // Every other audit event (branch/PR/preview/merge/publish) is written
    // later by a background job with no request-user context, and stays
    // attributed to "admin" — that's the correct, honest label for a
    // background-job completion, not a shortfall of this fix.
    await recordPublicationAuditEvent({
      organizationId: contentJob!.organization_id,
      websiteId: contentJob!.website_id,
      contentVersionId: approvedVersion.id,
      action: "CONTENT_APPROVED",
      result: "success",
      actor: user.email ?? undefined,
    });
  }

  revalidatePath(`/dashboard/${orgSlug}/content/${contentJob!.content_brief_id}`);
  redirect(`/dashboard/${orgSlug}/content/${contentJob!.content_brief_id}`);
}

export async function rejectContentDashboardAction(formData: FormData): Promise<void> {
  const orgSlug = String(formData.get("org_slug"));
  const contentJobId = String(formData.get("content_job_id"));
  const { organization, membership } = await requireOrganizationMembership(orgSlug, "MANAGER");
  if (!canApproveContent(membership.role)) throw new PermissionError("You don't have permission to reject content.");

  const contentJob = await getContentJob(contentJobId);
  assertOwnedByOrganization(contentJob, organization.id, "ContentJob", contentJobId);
  if (!canTransitionContentJob(contentJob!.status, "REJECTED")) {
    throw new Error(`Content cannot be rejected from its current status (${contentJob!.status}).`);
  }

  await updateContentJobStatus(contentJobId, "REJECTED", { completedAt: new Date().toISOString() });
  revalidatePath(`/dashboard/${orgSlug}/content/${contentJob!.content_brief_id}`);
  redirect(`/dashboard/${orgSlug}/content/${contentJob!.content_brief_id}`);
}

// ---------------------------------------------------------------------------
// Publishing — mirrors app/admin/actions.ts's loadApprovedPublicationTarget/
// createDraftAction/publishContentAction/mergeToProductionAction exactly,
// with one difference: organisation_id is derived from the verified session
// membership, never from a client-supplied hidden field at all (admin's
// version cross-checks a hint; this version never reads one).
// ---------------------------------------------------------------------------

async function loadApprovedPublicationTargetForDashboard(orgSlug: string, versionId: string, organizationId: string) {
  const version = await getContentVersionById(versionId);
  assertOwnedByOrganization(version, organizationId, "ContentVersion", versionId);

  const contentJob = await getContentJob(version!.content_job_id);
  if (!contentJob || contentJob.status !== "APPROVED") {
    throw new Error(`Content must be approved before publishing (current status: ${contentJob?.status ?? "unknown"}).`);
  }

  const brief = await getContentBrief(version!.content_brief_id);
  if (!brief) throw new Error("Content brief not found.");

  const publication = await getOrCreatePublicationForVersion({
    organizationId,
    websiteId: version!.website_id,
    contentVersionId: versionId,
    publicationType: brief.content_type as "CREATE_NEW_PAGE" | "OPTIMISE_EXISTING_PAGE",
    targetUrl: brief.target_url,
  });

  return { versionId, websiteId: version!.website_id, briefId: brief.id, publicationId: publication.id };
}

/** "Prepare Publication" — branch + commit + PR for GitHub, a draft for
 * WordPress. Never live either way. */
export async function preparePublicationAction(formData: FormData): Promise<void> {
  const orgSlug = String(formData.get("org_slug"));
  const contentVersionId = String(formData.get("content_version_id"));
  const { organization, membership } = await requireOrganizationMembership(orgSlug, "MANAGER");
  if (!canPreparePublication(membership.role)) throw new PermissionError("You don't have permission to prepare a publication.");

  const { websiteId, briefId, publicationId } = await loadApprovedPublicationTargetForDashboard(orgSlug, contentVersionId, organization.id);
  await triggerJob({
    organizationId: organization.id,
    websiteId,
    jobType: "CREATE_DRAFT",
    payload: { content_publication_id: publicationId },
    idempotencyKey: `CREATE_DRAFT:${contentVersionId}`,
  });
  revalidatePath(`/dashboard/${orgSlug}/content/${briefId}`);
  revalidatePath(`/dashboard/${orgSlug}/publishing`);
  redirect(`/dashboard/${orgSlug}/content/${briefId}`);
}

/** The only action that can make content publicly visible — a genuinely
 * distinct operation from preparePublicationAction (spec: "Production merge
 * must remain explicit"). Every re-check (APPROVED, connection valid, PR
 * exists/mergeable) happens server-side in the job handler against live
 * database/GitHub state, same as the admin equivalent. */
export async function approveProductionMergeAction(formData: FormData): Promise<void> {
  const orgSlug = String(formData.get("org_slug"));
  const contentVersionId = String(formData.get("content_version_id"));
  const { organization, membership } = await requireOrganizationMembership(orgSlug, "MANAGER");
  if (!canPublishToProduction(membership.role)) throw new PermissionError("You don't have permission to publish to production.");

  const { websiteId, briefId, publicationId } = await loadApprovedPublicationTargetForDashboard(orgSlug, contentVersionId, organization.id);
  const connection = await getCmsConnectionForWebsite(websiteId);
  const jobType = connection?.provider === "github" ? "MERGE_TO_PRODUCTION" : "PUBLISH_CONTENT";
  await triggerJob({
    organizationId: organization.id,
    websiteId,
    jobType,
    payload: { content_publication_id: publicationId },
    idempotencyKey: `${jobType}:${contentVersionId}`,
  });
  revalidatePath(`/dashboard/${orgSlug}/content/${briefId}`);
  revalidatePath(`/dashboard/${orgSlug}/publishing`);
  redirect(`/dashboard/${orgSlug}/content/${briefId}`);
}

// ---------------------------------------------------------------------------
// Settings: GitHub connection (OWNER only — canManageIntegrations)
// ---------------------------------------------------------------------------

export async function connectGitHubTokenDashboardAction(formData: FormData): Promise<void> {
  const orgSlug = String(formData.get("org_slug"));
  const token = String(formData.get("token") ?? "").trim();
  const { organization, membership } = await requireOrganizationMembership(orgSlug, "OWNER");
  if (!canManageIntegrations(membership.role)) throw new PermissionError("You don't have permission to manage integrations.");
  if (!token) throw new Error("A GitHub token is required.");

  const website = await getPrimaryWebsiteForOrganization(organization.id);
  if (!website) throw new Error("No website is configured for this organisation yet.");

  await upsertGitHubToken({ organizationId: organization.id, websiteId: website.id, token });
  revalidatePath(`/dashboard/${orgSlug}/settings`);
  redirect(`/dashboard/${orgSlug}/settings`);
}

export async function selectGitHubRepositoryDashboardAction(formData: FormData): Promise<void> {
  const orgSlug = String(formData.get("org_slug"));
  const owner = String(formData.get("owner") ?? "").trim();
  const repo = String(formData.get("repo") ?? "").trim();
  const productionBranch = String(formData.get("production_branch") ?? "").trim();
  const publicationMode = String(formData.get("publication_mode") ?? "GITHUB_PULL_REQUEST") as GithubPublicationMode;
  const contentAdapter = String(formData.get("content_adapter") ?? "configurable_markdown") as GithubContentAdapter;
  const { organization, membership } = await requireOrganizationMembership(orgSlug, "OWNER");
  if (!canManageIntegrations(membership.role)) throw new PermissionError("You don't have permission to manage integrations.");
  if (!owner || !repo || !productionBranch) throw new Error("Owner, repository, and production branch are all required.");

  const website = await getPrimaryWebsiteForOrganization(organization.id);
  if (!website) throw new Error("No website is configured for this organisation yet.");

  await selectGitHubRepository({ websiteId: website.id, owner, repo, productionBranch, publicationMode, accountLogin: owner, contentAdapter });
  revalidatePath(`/dashboard/${orgSlug}/settings`);
  redirect(`/dashboard/${orgSlug}/settings`);
}

/**
 * Phase 7.2C-B: the dashboard-side half of Search Console's two-step
 * connect flow (OAuth grant, then pick which verified property to attach) —
 * mirrors selectGitHubRepositoryDashboardAction's shape exactly, and reuses
 * the same selectSearchConsoleSite(websiteId, siteUrl) the admin flow
 * already calls (lib/db/search-console.ts), unchanged.
 */
export async function selectSearchConsoleSiteDashboardAction(formData: FormData): Promise<void> {
  const orgSlug = String(formData.get("org_slug"));
  const siteUrl = String(formData.get("site_url") ?? "").trim();
  const { organization, membership } = await requireOrganizationMembership(orgSlug, "OWNER");
  if (!canManageIntegrations(membership.role)) throw new PermissionError("You don't have permission to manage integrations.");
  if (!siteUrl) throw new Error("Choose a Search Console property.");

  const website = await getPrimaryWebsiteForOrganization(organization.id);
  if (!website) throw new Error("No website is configured for this organisation yet.");

  await selectSearchConsoleSite(website.id, siteUrl);
  revalidatePath(`/dashboard/${orgSlug}/settings`);
  redirect(`/dashboard/${orgSlug}/settings`);
}

/**
 * Phase 7.2D: mirrors selectSearchConsoleSiteDashboardAction's exact shape
 * (same OWNER-only session gate, same session-derived website resolution,
 * never a client-supplied website_id) so a client who connects the wrong
 * Google property — or wants to switch accounts — isn't stuck depending on
 * an admin, closing the one escape-hatch gap the 7.2D audit found in
 * 7.2C-B's otherwise-complete self-service flow. Reuses
 * disconnectSearchConsole (lib/db/search-console.ts) entirely unchanged —
 * the same function the admin flow's disconnectSearchConsoleAction already
 * calls, which that action and its route are untouched by this addition.
 */
export async function disconnectSearchConsoleDashboardAction(formData: FormData): Promise<void> {
  const orgSlug = String(formData.get("org_slug"));
  const { organization, membership } = await requireOrganizationMembership(orgSlug, "OWNER");
  if (!canManageIntegrations(membership.role)) throw new PermissionError("You don't have permission to manage integrations.");

  const website = await getPrimaryWebsiteForOrganization(organization.id);
  if (!website) throw new Error("No website is configured for this organisation yet.");

  await disconnectSearchConsole(website.id);
  revalidatePath(`/dashboard/${orgSlug}/settings`);
  redirect(`/dashboard/${orgSlug}/settings`);
}

export async function testPublishingConnectionDashboardAction(formData: FormData): Promise<void> {
  const orgSlug = String(formData.get("org_slug"));
  const { organization, membership } = await requireOrganizationMembership(orgSlug, "OWNER");
  if (!canManageIntegrations(membership.role)) throw new PermissionError("You don't have permission to manage integrations.");

  const website = await getPrimaryWebsiteForOrganization(organization.id);
  if (!website) throw new Error("No website is configured for this organisation yet.");

  const connection = await getCmsConnectionForWebsite(website.id);
  if (!connection) throw new Error("No publishing connection is configured yet.");

  const decryptedSecret = await getDecryptedCredential(connection.credential_secret_id);
  const provider = createPublishingProvider(buildPublishingConnectionConfig(connection, decryptedSecret));
  const result = await provider.testConnection();
  await markConnectionTested(connection.id, result.ok, result.ok ? null : result.message);

  revalidatePath(`/dashboard/${orgSlug}/settings`);
  redirect(`/dashboard/${orgSlug}/settings`);
}

// ---------------------------------------------------------------------------
// Settings: team & invitations (OWNER only — canManageUsers)
// ---------------------------------------------------------------------------

export async function inviteMemberAction(formData: FormData): Promise<void> {
  const orgSlug = String(formData.get("org_slug"));
  const email = String(formData.get("email") ?? "").trim();
  const role = String(formData.get("role") ?? "VIEWER") as MembershipRole;
  const { organization, membership, user } = await requireOrganizationMembership(orgSlug, "OWNER");
  if (!canManageUsers(membership.role)) throw new PermissionError("You don't have permission to invite users.");
  if (!email) throw new Error("An email address is required.");

  try {
    await insertInvitation({ organizationId: organization.id, email, role, invitedBy: user.id });
  } catch (error) {
    // Phase 7.2D: organization_invitations' partial unique index (migration
    // 0027) blocks a second simultaneous pending invitation for the same
    // email — including one a client currently sees as "Expired" (7.2C-C's
    // expiry is display-only; the underlying row's status never actually
    // changes). Translate Postgres' raw unique-violation (23505) into the
    // one concrete next step instead of letting a database error reach the
    // client verbatim. Any other error is re-thrown unchanged.
    if (error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "23505") {
      throw new Error("There's already a pending invitation for this email — revoke it below, then send a new one.");
    }
    // Phase 7.2G: any other failure (a transient connection error, a
    // different constraint, an RLS deny) previously reached the client as
    // the raw Supabase/Postgrest error object's message — the one place in
    // the dashboard that violated error.tsx's documented "every throw is
    // already a human-readable sentence" invariant. Generic and client-safe,
    // same idiom as the 23505 branch above.
    throw new Error("Couldn't create the invitation — please try again.");
  }

  revalidatePath(`/dashboard/${orgSlug}/settings`);
  redirect(`/dashboard/${orgSlug}/settings`);
}

export async function revokeInvitationAction(formData: FormData): Promise<void> {
  const orgSlug = String(formData.get("org_slug"));
  const invitationId = String(formData.get("invitation_id"));
  const { organization, membership } = await requireOrganizationMembership(orgSlug, "OWNER");
  if (!canManageUsers(membership.role)) throw new PermissionError("You don't have permission to manage invitations.");

  const invitation = await getInvitationById(invitationId);
  assertOwnedByOrganization(invitation, organization.id, "Invitation", invitationId);
  await revokeInvitation(invitationId);
  revalidatePath(`/dashboard/${orgSlug}/settings`);
  redirect(`/dashboard/${orgSlug}/settings`);
}

export async function updateMemberRoleAction(formData: FormData): Promise<void> {
  const orgSlug = String(formData.get("org_slug"));
  const membershipId = String(formData.get("membership_id"));
  const role = String(formData.get("role")) as MembershipRole;
  const { organization, membership } = await requireOrganizationMembership(orgSlug, "OWNER");
  if (!canManageUsers(membership.role)) throw new PermissionError("You don't have permission to manage roles.");

  const target = await getMembershipById(membershipId);
  assertOwnedByOrganization(target, organization.id, "Membership", membershipId);

  // An organisation must always keep at least one OWNER, or nobody could
  // ever manage it again.
  if (target!.role === "OWNER" && role !== "OWNER" && (await countOwners(organization.id)) <= 1) {
    throw new Error("This organisation must keep at least one owner — promote someone else first.");
  }

  await updateMembershipRole(membershipId, role);
  revalidatePath(`/dashboard/${orgSlug}/settings`);
  redirect(`/dashboard/${orgSlug}/settings`);
}

export async function removeMemberAction(formData: FormData): Promise<void> {
  const orgSlug = String(formData.get("org_slug"));
  const membershipId = String(formData.get("membership_id"));
  const { organization, membership } = await requireOrganizationMembership(orgSlug, "OWNER");
  if (!canManageUsers(membership.role)) throw new PermissionError("You don't have permission to remove members.");

  const target = await getMembershipById(membershipId);
  assertOwnedByOrganization(target, organization.id, "Membership", membershipId);

  if (target!.role === "OWNER" && (await countOwners(organization.id)) <= 1) {
    throw new Error("This organisation must keep at least one owner — you can't remove the last one.");
  }

  await deleteMembership(membershipId);
  revalidatePath(`/dashboard/${orgSlug}/settings`);
  redirect(`/dashboard/${orgSlug}/settings`);
}
