import { requireOrganizationMembership } from "@/lib/auth/session";
import { getPrimaryWebsiteForOrganization } from "@/lib/dashboard/website";
import { getSearchConsoleConnection } from "@/lib/db/search-console";
import { getCmsConnectionForWebsite } from "@/lib/db/cms-connections";
import { toPublicConnection } from "@/lib/publishing/connection-view";
import { listMembersForOrganization } from "@/lib/db/memberships";
import { listAuthUsersByIds } from "@/lib/auth/users";
import { listInvitationsForOrganization } from "@/lib/db/invitations";
import { canManageIntegrations, canManageUsers } from "@/lib/auth/permissions";
import {
  connectGitHubTokenDashboardAction,
  selectGitHubRepositoryDashboardAction,
  testPublishingConnectionDashboardAction,
  inviteMemberAction,
  revokeInvitationAction,
  updateMemberRoleAction,
  removeMemberAction,
} from "@/app/dashboard/actions";
import { SubmitButton } from "@/app/dashboard/_components/SubmitButton";
import { ConfirmSubmitButton } from "@/app/dashboard/_components/ConfirmSubmitButton";
import type { MembershipRole } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

const ROLES: MembershipRole[] = ["OWNER", "MANAGER", "EDITOR", "VIEWER"];

function fmt(date: string | null): string {
  return date ? new Date(date).toLocaleDateString() : "-";
}

export default async function SettingsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { organization, membership, user } = await requireOrganizationMembership(orgSlug);
  const website = await getPrimaryWebsiteForOrganization(organization.id);

  const [searchConsole, cmsConnectionRow, members, pendingInvitations] = await Promise.all([
    website ? getSearchConsoleConnection(website.id) : Promise.resolve(null),
    website ? getCmsConnectionForWebsite(website.id) : Promise.resolve(null),
    listMembersForOrganization(organization.id),
    listInvitationsForOrganization(organization.id, "pending"),
  ]);
  const cmsConnection = cmsConnectionRow ? toPublicConnection(cmsConnectionRow) : null;
  const usersByid = await listAuthUsersByIds(members.map((m) => m.user_id));

  const canManageIntegrationsHere = canManageIntegrations(membership.role);
  const canManageUsersHere = canManageUsers(membership.role);

  return (
    <>
      <h1 className="dash-page-title">Settings</h1>
      <p className="dash-page-subtitle">Your website, integrations, and team.</p>

      <div className="dash-card" style={{ marginBottom: 20 }}>
        <h2 style={{ marginTop: 0, fontSize: "1rem" }}>Website</h2>
        {website ? (
          <p className="dash-muted" style={{ margin: 0 }}>
            <strong>{website.name}</strong> &middot; {website.base_url}
          </p>
        ) : (
          <p className="dash-muted">No website configured yet.</p>
        )}
      </div>

      <div className="dash-card" style={{ marginBottom: 20 }}>
        <h2 style={{ marginTop: 0, fontSize: "1rem" }}>Search Console</h2>
        {searchConsole ? (
          <p className="dash-muted" style={{ margin: 0 }}>
            {searchConsole.site_url ?? "Property not yet selected"} &middot; <span className={`dash-badge ${searchConsole.status === "active" ? "success" : "warning"}`}>{searchConsole.status}</span>
          </p>
        ) : (
          <p className="dash-muted">Not connected yet — contact your account manager to connect Google Search Console.</p>
        )}
      </div>

      <div className="dash-card" style={{ marginBottom: 20 }}>
        <h2 style={{ marginTop: 0, fontSize: "1rem" }}>Publishing connection</h2>
        {cmsConnection ? (
          <p className="dash-muted">
            {cmsConnection.provider === "github" ? (
              <>
                GitHub: <strong>{(cmsConnectionRow as { github_owner?: string })?.github_owner}/{(cmsConnectionRow as { github_repo?: string })?.github_repo}</strong> (branch:{" "}
                {(cmsConnectionRow as { github_production_branch?: string })?.github_production_branch})
              </>
            ) : (
              <>
                WordPress: <strong>{cmsConnection.baseUrl}</strong>
              </>
            )}{" "}
            &middot; <span className={`dash-badge ${cmsConnection.status === "active" ? "success" : "warning"}`}>{cmsConnection.status}</span>
            {cmsConnection.lastTestError && <span className="dash-muted"> — {cmsConnection.lastTestError}</span>}
          </p>
        ) : (
          <p className="dash-muted">No publishing connection configured yet.</p>
        )}

        {canManageIntegrationsHere && website && (
          <>
            {cmsConnection && (
              <form action={testPublishingConnectionDashboardAction} style={{ marginBottom: 16 }}>
                <input type="hidden" name="org_slug" value={orgSlug} />
                <SubmitButton variant="secondary" pendingLabel="Testing…">
                  Test connection
                </SubmitButton>
              </form>
            )}

            <details>
              <summary style={{ cursor: "pointer", fontSize: "0.85rem", fontWeight: 600 }}>
                {cmsConnection?.provider === "github" ? "Update GitHub token" : "Connect GitHub"}
              </summary>
              <form action={connectGitHubTokenDashboardAction} className="dash-form-row" style={{ marginTop: 12 }}>
                <input type="hidden" name="org_slug" value={orgSlug} />
                <div className="dash-field" style={{ flex: 1, minWidth: 260 }}>
                  <label htmlFor="token">Fine-grained Personal Access Token</label>
                  <input id="token" type="password" name="token" autoComplete="off" required />
                </div>
                <SubmitButton variant="secondary" pendingLabel="Saving…">
                  Save token
                </SubmitButton>
              </form>

              {cmsConnectionRow?.status === "pending_repo_selection" && (
                <form action={selectGitHubRepositoryDashboardAction} className="dash-form-row" style={{ marginTop: 12 }}>
                  <input type="hidden" name="org_slug" value={orgSlug} />
                  <div className="dash-field">
                    <label htmlFor="owner">Repository owner</label>
                    <input id="owner" type="text" name="owner" placeholder="rhmatiqur-commits" required />
                  </div>
                  <div className="dash-field">
                    <label htmlFor="repo">Repository name</label>
                    <input id="repo" type="text" name="repo" placeholder="cvcentral" required />
                  </div>
                  <div className="dash-field">
                    <label htmlFor="production_branch">Production branch</label>
                    <input id="production_branch" type="text" name="production_branch" placeholder="master" required />
                  </div>
                  <SubmitButton variant="secondary" pendingLabel="Saving…">
                    Save repository
                  </SubmitButton>
                </form>
              )}
            </details>
          </>
        )}
      </div>

      <div className="dash-card">
        <h2 style={{ marginTop: 0, fontSize: "1rem" }}>Team</h2>
        <table className="dash-table">
          <thead>
            <tr>
              <th>Member</th>
              <th>Role</th>
              {canManageUsersHere && <th></th>}
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const info = usersByid.get(m.user_id);
              const isSelf = m.user_id === user.id;
              return (
                <tr key={m.id}>
                  <td>
                    {info?.email ?? "Unknown user"}
                    {isSelf && <span className="dash-muted"> (you)</span>}
                  </td>
                  <td>
                    {canManageUsersHere && !isSelf ? (
                      <form action={updateMemberRoleAction} style={{ display: "inline-flex", gap: 6 }}>
                        <input type="hidden" name="org_slug" value={orgSlug} />
                        <input type="hidden" name="membership_id" value={m.id} />
                        <select name="role" defaultValue={m.role} style={{ fontSize: "0.8rem" }}>
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                        <SubmitButton variant="secondary" pendingLabel="Saving…" style={{ padding: "4px 10px", fontSize: "0.78rem" }}>
                          Save
                        </SubmitButton>
                      </form>
                    ) : (
                      <span className="dash-badge">{m.role}</span>
                    )}
                  </td>
                  {canManageUsersHere && (
                    <td>
                      {!isSelf && (
                        <form action={removeMemberAction}>
                          <input type="hidden" name="org_slug" value={orgSlug} />
                          <input type="hidden" name="membership_id" value={m.id} />
                          <ConfirmSubmitButton
                            variant="danger-outline"
                            style={{ padding: "4px 10px", fontSize: "0.78rem" }}
                            confirmTitle={`Remove ${info?.email ?? "this person"} from ${organization.name}?`}
                            confirmDescription="They'll immediately lose access to this organisation's dashboard. You can invite them again later if needed."
                            confirmLabel="Remove member"
                          >
                            Remove
                          </ConfirmSubmitButton>
                        </form>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>

        {pendingInvitations.length > 0 && (
          <>
            <h3 style={{ fontSize: "0.85rem" }}>Pending invitations</h3>
            <table className="dash-table">
              <tbody>
                {pendingInvitations.map((inv) => (
                  <tr key={inv.id}>
                    <td>{inv.email}</td>
                    <td>
                      <span className="dash-badge">{inv.role}</span>
                    </td>
                    <td className="dash-muted">Expires {fmt(inv.expires_at)}</td>
                    {canManageUsersHere && (
                      <td>
                        <form action={revokeInvitationAction}>
                          <input type="hidden" name="org_slug" value={orgSlug} />
                          <input type="hidden" name="invitation_id" value={inv.id} />
                          <SubmitButton variant="secondary" pendingLabel="Revoking…" style={{ padding: "4px 10px", fontSize: "0.78rem" }}>
                            Revoke
                          </SubmitButton>
                        </form>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {canManageUsersHere && (
          <form action={inviteMemberAction} className="dash-form-row" style={{ marginTop: 16 }}>
            <input type="hidden" name="org_slug" value={orgSlug} />
            <div className="dash-field" style={{ flex: 1, minWidth: 200 }}>
              <label htmlFor="email">Invite by email</label>
              <input id="email" type="email" name="email" required />
            </div>
            <div className="dash-field">
              <label htmlFor="role">Role</label>
              <select id="role" name="role" defaultValue="VIEWER">
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <SubmitButton variant="primary" pendingLabel="Sending…">
              Send invite
            </SubmitButton>
          </form>
        )}
      </div>
    </>
  );
}
