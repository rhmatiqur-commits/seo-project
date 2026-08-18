import type { MembershipRole } from "@/lib/supabase/types";

/**
 * Pure role -> capability mapping for the client portal (Phase 7 spec's
 * permission table, transcribed exactly). Zero DB/session dependency —
 * every dashboard Server Action calls one of these functions with a role
 * already verified server-side (lib/auth/session.ts's
 * requireOrganizationMembership), never a role read from the browser.
 *
 * Deliberately not a bitmask/generic RBAC engine — four fixed roles, a
 * short fixed capability list, same "small named function per rule" style
 * as lib/outcomes/autonomy.ts rather than a configurable permissions
 * system nothing in this phase needs.
 */

const ROLE_ORDER: readonly MembershipRole[] = ["VIEWER", "EDITOR", "MANAGER", "OWNER"];

function roleRank(role: MembershipRole): number {
  const rank = ROLE_ORDER.indexOf(role);
  // Legacy Phase 1 labels (owner/admin/member) are still valid enum values
  // (Postgres enums are add-only) but were never used by any app code and
  // are not part of Phase 7's role model — treat any of them as the lowest
  // rank (VIEWER-equivalent) rather than crashing, so a stray legacy row
  // fails closed instead of throwing.
  return rank === -1 ? 0 : rank;
}

/** True if `role` is at least as privileged as `minRole` (OWNER > MANAGER > EDITOR > VIEWER). */
export function roleAtLeast(role: MembershipRole, minRole: MembershipRole): boolean {
  return roleRank(role) >= roleRank(minRole);
}

// --- OWNER-only ---

/** Manage users: invite, change roles, remove members. */
export function canManageUsers(role: MembershipRole): boolean {
  return role === "OWNER";
}

/** Manage integrations: connect/disconnect Search Console, GitHub/CMS, change publication mode. */
export function canManageIntegrations(role: MembershipRole): boolean {
  return role === "OWNER";
}

/** Organisation-level settings (name, business profile fields, autonomy level). */
export function canManageOrganizationSettings(role: MembershipRole): boolean {
  return role === "OWNER";
}

// --- OWNER + MANAGER ---

/** Approve a content_job (the human-approval gate before anything can publish). */
export function canApproveContent(role: MembershipRole): boolean {
  return roleAtLeast(role, "MANAGER");
}

/** Prepare a publication (WordPress draft, or GitHub branch+commit+PR) — never live on its own. */
export function canPreparePublication(role: MembershipRole): boolean {
  return roleAtLeast(role, "MANAGER");
}

/** The explicit "make it live" action — WordPress Publish, or GitHub MERGE_TO_PRODUCTION.
 * EDITOR is deliberately excluded by default ("production publishing only if explicitly
 * permitted" — no per-user override mechanism exists yet in this phase, so the safe default
 * is OWNER/MANAGER only). */
export function canPublishToProduction(role: MembershipRole): boolean {
  return roleAtLeast(role, "MANAGER");
}

/** Accept/dismiss an opportunity, change a task's status, request content revisions. */
export function canManageSeoWork(role: MembershipRole): boolean {
  return roleAtLeast(role, "MANAGER");
}

// --- OWNER + MANAGER + EDITOR ---

/** Create/edit content (generate a brief, trigger generation, request changes) — not approve. */
export function canEditContent(role: MembershipRole): boolean {
  return roleAtLeast(role, "EDITOR");
}

// --- Every role (including VIEWER) ---

/** Read-only access to dashboards/reports/opportunities/outcomes — every role has this once they're a member at all. */
export function canView(_role: MembershipRole): boolean {
  return true;
}
