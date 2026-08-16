/**
 * Server-side IDOR guard: verifies a resource actually belongs to the
 * organization a caller claims it does, rather than trusting a
 * client-supplied organization_id at face value.
 *
 * This does NOT provide multi-tenant/cross-client authorization — there is
 * no per-user session system in this codebase yet (see SECURITY_AUDIT.md),
 * so there's no caller *identity* to check "is this org member allowed to
 * touch this resource" against. What this DOES prevent: a tampered hidden
 * form field or a manually-crafted request body causing a job/mutation to be
 * silently attributed to the wrong organization when the resource's real
 * owner is already known server-side (e.g. from a `getWebsite(id)` lookup).
 * Every app/api/** trigger route already derives organization_id this way;
 * this helper makes app/admin/actions.ts do the same instead of trusting its
 * hidden form fields.
 */

export class OrganizationMismatchError extends Error {
  constructor(resourceType: string, resourceId: string) {
    super(`${resourceType} ${resourceId} does not belong to the expected organization.`);
    this.name = "OrganizationMismatchError";
  }
}

export interface OwnedByOrganization {
  organization_id: string;
}

/** Throws OrganizationMismatchError if `resource.organization_id` doesn't
 * match `expectedOrganizationId`. Returns the resource's real
 * organization_id on success — callers should use THIS value going forward,
 * never the client-supplied one that was being checked.
 *
 * Generic over `resourceType` (Phase 4 introduced content_briefs/content_jobs
 * routes that need the exact same IDOR guard as websites) — the resource's
 * own organization_id is always the source of truth; a mismatched (or
 * missing) expectedOrganizationId is a signal worth surfacing rather than
 * silently overriding, but never fatal to the legitimate case where the
 * caller simply omitted it. */
export function assertOwnedByOrganization(
  resource: OwnedByOrganization | null,
  expectedOrganizationId: string | null | undefined,
  resourceType: string,
  resourceId: string
): string {
  if (!resource) throw new OrganizationMismatchError(resourceType, resourceId);
  if (expectedOrganizationId && expectedOrganizationId !== resource.organization_id) {
    throw new OrganizationMismatchError(resourceType, resourceId);
  }
  return resource.organization_id;
}

/** Thin, name-preserving wrapper over assertOwnedByOrganization — every
 * existing call site keeps working unchanged. */
export function assertWebsiteBelongsToOrganization(website: OwnedByOrganization | null, expectedOrganizationId: string | null | undefined, websiteId: string): string {
  return assertOwnedByOrganization(website, expectedOrganizationId, "Website", websiteId);
}
