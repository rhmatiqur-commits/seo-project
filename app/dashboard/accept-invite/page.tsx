import { getInvitationByToken } from "@/lib/db/invitations";
import { getOrganization } from "@/lib/db/organizations";
import { findAuthUserByEmail } from "@/lib/auth/users";
import { getCurrentUser } from "@/lib/auth/session";
import { acceptInvitationSignupAction, acceptInvitationForExistingUserAction } from "@/app/dashboard/auth-actions";
import { SubmitButton } from "@/app/dashboard/_components/SubmitButton";

export const dynamic = "force-dynamic";

export default async function AcceptInvitePage({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const { token, error } = await searchParams;

  if (!token) {
    return (
      <div className="dash-auth-page">
        <div className="dash-card dash-auth-card">
          <h1 className="dash-page-title">Invalid invitation link</h1>
          <p className="dash-muted">This link is missing its invitation token.</p>
        </div>
      </div>
    );
  }

  const invitation = await getInvitationByToken(token);
  const expired = invitation ? new Date(invitation.expires_at) < new Date() : false;
  const usable = invitation && invitation.status === "pending" && !expired;

  if (!usable) {
    return (
      <div className="dash-auth-page">
        <div className="dash-card dash-auth-card">
          <h1 className="dash-page-title">Invitation unavailable</h1>
          <p className="dash-muted">
            {!invitation && "This invitation link is not valid."}
            {invitation?.status === "accepted" && "This invitation has already been accepted."}
            {invitation?.status === "revoked" && "This invitation has been revoked."}
            {expired && invitation?.status === "pending" && "This invitation has expired — ask an organisation owner to send a new one."}
          </p>
        </div>
      </div>
    );
  }

  const organization = await getOrganization(invitation.organization_id);
  const currentUser = await getCurrentUser();
  const existingAccount = await findAuthUserByEmail(invitation.email);

  // Already signed in as the invited email — one click accepts.
  if (currentUser && currentUser.email?.toLowerCase() === invitation.email.toLowerCase()) {
    return (
      <div className="dash-auth-page">
        <div className="dash-card dash-auth-card">
          <h1 className="dash-page-title">Join {organization?.name ?? "this organisation"}</h1>
          <p className="dash-page-subtitle">
            You&apos;ve been invited as <strong>{invitation.role}</strong>.
          </p>
          {error && <div className="dash-notice danger">{error}</div>}
          <form action={acceptInvitationForExistingUserAction}>
            <input type="hidden" name="token" value={token} />
            <SubmitButton variant="primary" pendingLabel="Joining…" style={{ width: "100%", justifyContent: "center" }}>
              Accept invitation
            </SubmitButton>
          </form>
        </div>
      </div>
    );
  }

  // Signed in as someone else — must sign out first.
  if (currentUser) {
    return (
      <div className="dash-auth-page">
        <div className="dash-card dash-auth-card">
          <h1 className="dash-page-title">Wrong account</h1>
          <p className="dash-muted">
            This invitation was sent to <strong>{invitation.email}</strong>, but you&apos;re signed in as {currentUser.email}. Sign out and try again.
          </p>
        </div>
      </div>
    );
  }

  // Not signed in: existing account -> log in; no account -> set a password.
  return (
    <div className="dash-auth-page">
      <div className="dash-card dash-auth-card">
        <h1 className="dash-page-title">Join {organization?.name ?? "this organisation"}</h1>
        <p className="dash-page-subtitle">
          You&apos;ve been invited ({invitation.email}) as <strong>{invitation.role}</strong>.
        </p>
        {error && <div className="dash-notice danger">{error}</div>}
        {existingAccount ? (
          <p>
            <a className="dash-btn" href={`/dashboard/login?next=${encodeURIComponent(`/dashboard/accept-invite?token=${token}`)}`} style={{ width: "100%", justifyContent: "center" }}>
              Sign in to accept
            </a>
          </p>
        ) : (
          <form action={acceptInvitationSignupAction}>
            <input type="hidden" name="token" value={token} />
            <div className="dash-field" style={{ marginBottom: 18 }}>
              <label htmlFor="password">Choose a password</label>
              <input id="password" type="password" name="password" required minLength={8} autoComplete="new-password" autoFocus />
            </div>
            <SubmitButton variant="primary" pendingLabel="Creating account…" style={{ width: "100%", justifyContent: "center" }}>
              Create account &amp; join
            </SubmitButton>
          </form>
        )}
      </div>
    </div>
  );
}
