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
 * never the client-supplied one that was being checked. */
export function assertWebsiteBelongsToOrganization(website: OwnedByOrganization | null, expectedOrganizationId: string | null | undefined, websiteId: string): string {
  if (!website) throw new OrganizationMismatchError("Website", websiteId);
  // The website's own organization_id is always the source of truth; a
  // mismatched (or missing) expectedOrganizationId is a signal worth
  // surfacing rather than silently overriding, but never fatal to the
  // legitimate case where the caller simply omitted it.
  if (expectedOrganizationId && expectedOrganizationId !== website.organization_id) {
    throw new OrganizationMismatchError("Website", websiteId);
  }
  return website.organization_id;
}
