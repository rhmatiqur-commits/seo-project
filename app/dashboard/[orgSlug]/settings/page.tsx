import { requireOrganizationMembership } from "@/lib/auth/session";
import { getPrimaryWebsiteForOrganization } from "@/lib/dashboard/website";
import { getSearchConsoleConnection } from "@/lib/db/search-console";
import { listSites } from "@/lib/search-console/client";
import { getCmsConnectionForWebsite } from "@/lib/db/cms-connections";
import { toPublicConnection } from "@/lib/publishing/connection-view";
import { listMembersForOrganization } from "@/lib/db/memberships";
import { listAuthUsersByIds } from "@/lib/auth/users";
import { listInvitationsForOrganization } from "@/lib/db/invitations";
import { canManageIntegrations, canManageUsers } from "@/lib/auth/permissions";
import { buildInviteAcceptUrl, invitationDisplayStatus } from "@/lib/dashboard/invitations";
import {
  connectGitHubTokenDashboardAction,
  selectGitHubRepositoryDashboardAction,
  selectSearchConsoleSiteDashboardAction,
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
  // Phase 7.2C-A: same NEXT_PUBLIC_SITE_URL app/dashboard/auth-actions.ts
  // already uses to build an absolute link back to this app (e.g. for the
  // password-reset email) — reused here, not a new env var.
  const siteOrigin = process.env.NEXT_PUBLIC_SITE_URL || "";

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
        {!searchConsole && <p className="dash-muted" style={{ margin: 0 }}>Not connected yet.</p>}
        {searchConsole?.status === "pending_site_selection" && (
          <p className="dash-muted" style={{ margin: 0 }}>
            Connected to Google &middot; <span className="dash-badge warning">choose a property below to finish</span>
          </p>
        )}
        {searchConsole?.status === "error" && (
          <p className="dash-muted" style={{ margin: 0 }}>
            <span className="dash-badge danger">Connection error</span>
            {searchConsole.last_sync_error && <> — {searchConsole.last_sync_error}</>}
          </p>
        )}
        {searchConsole?.status === "active" && (
          <p className="dash-muted" style={{ margin: 0 }}>
            {searchConsole.site_url} &middot; <span className="dash-badge success">active</span>
          </p>
        )}

        {/* Phase 7.2C-B: OWNER-only, same gate as GitHub above — start (or
            retry) the OAuth flow via the client-session-authenticated route,
            never the admin one. */}
        {website && canManageIntegrationsHere && (!searchConsole || searchConsole.status === "error") && (
          <p style={{ marginTop: 12, marginBottom: 0 }}>
            <a className="dash-btn" href={`/dashboard/${orgSlug}/search-console/connect`}>
              {searchConsole?.status === "error" ? "Reconnect Search Console" : "Connect Search Console"}
            </a>
          </p>
        )}
        {website && canManageIntegrationsHere && searchConsole?.status === "pending_site_selection" && (
          <SearchConsoleSitePicker orgSlug={orgSlug} accessToken={searchConsole.access_token} />
        )}
        {website && !canManageIntegrationsHere && (!searchConsole || searchConsole.status !== "active") && (
          <p className="dash-muted" style={{ fontSize: "0.82rem", marginTop: 12, marginBottom: 0 }}>
            Only the account Owner can connect Search Console — ask an Owner on your team.
          </p>
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
        {website && !canManageIntegrationsHere && (
          <p className="dash-muted" style={{ fontSize: "0.82rem", marginTop: 12, marginBottom: 0 }}>
            Only the account Owner can manage integrations — ask an Owner on your team.
          </p>
        )}
      </div>

      <div className="dash-card">
        <h2 style={{ marginTop: 0, fontSize: "1rem" }}>Team</h2>
        {!canManageUsersHere && (
          <p className="dash-muted" style={{ fontSize: "0.82rem", marginTop: 0, marginBottom: 12 }}>
            Only the account Owner can invite, remove, or change the role of team members — ask an Owner on your team.
          </p>
        )}
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
            {/* Phase 7.2C-C: "Invitations", not "Pending invitations" — the
                fetch below is still status='pending' at the DB level, but a
                row can now display as Expired once its expires_at has
                passed, so the heading no longer promises every row is
                still live. */}
            <h3 style={{ fontSize: "0.85rem" }}>Invitations</h3>
            <table className="dash-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  {canManageUsersHere && <th></th>}
                </tr>
              </thead>
              <tbody>
                {pendingInvitations.map((inv) => {
                  const displayStatus = invitationDisplayStatus(inv);
                  const isExpired = displayStatus === "expired";
                  return (
                    <tr key={inv.id}>
                      <td>{inv.email}</td>
                      <td>
                        <span className="dash-badge">{inv.role}</span>
                      </td>
                      <td className="dash-muted">
                        <span className={`dash-badge ${isExpired ? "danger" : "info"}`}>{isExpired ? "Expired" : "Pending"}</span>{" "}
                        {isExpired ? "expired" : "expires"} {fmt(inv.expires_at)}
                      </td>
                      {/* Phase 7.2C-A: the invite link is only ever rendered inside this
                          already-Owner-gated cell — the rest of the row (email/role/status)
                          is visible to every member, but the token itself never is.
                          Phase 7.2C-C: an expired link isn't shown at all — nothing left
                          to copy, only Revoke (to free the email for a fresh invite). */}
                      {canManageUsersHere && (
                        <td>
                          {!isExpired && (
                            <p className="dash-muted" style={{ margin: "0 0 6px", fontSize: "0.78rem" }}>
                              Invite link: <code style={{ wordBreak: "break-all" }}>{buildInviteAcceptUrl(siteOrigin, inv.token)}</code>
                            </p>
                          )}
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
                  );
                })}
              </tbody>
            </table>
          </>
        )}

        {canManageUsersHere && (
          <>
            <p className="dash-muted" style={{ fontSize: "0.82rem", marginTop: 16, marginBottom: 8 }}>
              Invitations aren&apos;t emailed automatically — after creating one, copy its link from the table above and send it to the
              person yourself.
            </p>
            <form action={inviteMemberAction} className="dash-form-row">
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
              <SubmitButton variant="primary" pendingLabel="Creating…">
                Create invite link
              </SubmitButton>
            </form>
          </>
        )}
      </div>
    </>
  );
}

/**
 * Phase 7.2C-B: the dashboard-facing mirror of admin's own SitePicker
 * (app/admin/websites/[id]/search-console/page.tsx) — same listSites call,
 * same try/catch-and-report-loadError shape, same "no access token stored"
 * fallback. Only the destination action and gating are different
 * (selectSearchConsoleSiteDashboardAction, org_slug instead of website_id).
 */
async function SearchConsoleSitePicker({ orgSlug, accessToken }: { orgSlug: string; accessToken: string | null }) {
  if (!accessToken) {
    return (
      <p className="dash-muted" style={{ fontSize: "0.85rem", marginTop: 12 }}>
        No access token stored — try reconnecting above.
      </p>
    );
  }

  let sites: Awaited<ReturnType<typeof listSites>> = [];
  let loadError: string | null = null;
  try {
    sites = await listSites(accessToken);
  } catch (error) {
    loadError = error instanceof Error ? error.message : String(error);
  }

  return (
    <div style={{ marginTop: 12 }}>
      {loadError && (
        <p className="dash-muted" style={{ fontSize: "0.85rem" }}>
          Could not list properties: {loadError}
        </p>
      )}
      {!loadError && sites.length === 0 && (
        <p className="dash-muted" style={{ fontSize: "0.85rem" }}>
          No verified Search Console properties found on that Google account.
        </p>
      )}
      {!loadError && sites.length > 0 && (
        <form action={selectSearchConsoleSiteDashboardAction} className="dash-form-row">
          <input type="hidden" name="org_slug" value={orgSlug} />
          <select name="site_url" defaultValue="" style={{ fontSize: "0.85rem" }}>
            <option value="" disabled>
              Select a property
            </option>
            {sites.map((s) => (
              <option key={s.siteUrl} value={s.siteUrl}>
                {s.siteUrl} ({s.permissionLevel})
              </option>
            ))}
          </select>
          <SubmitButton variant="secondary" pendingLabel="Connecting…">
            Connect this property
          </SubmitButton>
        </form>
      )}
    </div>
  );
}
