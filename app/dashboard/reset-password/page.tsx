import { createSessionClient } from "@/lib/supabase/server-session";
import { updatePasswordAction } from "@/app/dashboard/auth-actions";
import { SubmitButton } from "@/app/dashboard/_components/SubmitButton";

export const dynamic = "force-dynamic";

/**
 * The link Supabase emails (via requestPasswordResetAction's
 * resetPasswordForEmail) lands here with a PKCE `?code=`. Exchanging it
 * establishes a short-lived "recovery" session (this is the one place a
 * session is allowed to be established without a password — the emailed
 * link, sent only to the account's real address, is what proves identity
 * here) — done server-side in this Server Component render, before
 * anything is displayed. `updatePasswordAction` then operates on that
 * session, never on an organisation/email the form itself supplies.
 */
export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ code?: string; error?: string }> }) {
  const { code, error: formError } = await searchParams;

  let exchangeError: string | null = null;
  if (code) {
    const supabase = await createSessionClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) exchangeError = error.message;
  }

  const displayError = formError ?? exchangeError;

  return (
    <div className="dash-auth-page">
      <div className="dash-card dash-auth-card">
        <h1 className="dash-page-title">Choose a new password</h1>
        {displayError && <div className="dash-notice danger">{displayError}</div>}
        {!code && !formError ? (
          <p className="dash-muted">
            This page is reached from the link in your password-reset email — request a new one from{" "}
            <a href="/dashboard/forgot-password">Forgot password</a>.
          </p>
        ) : (
          <form action={updatePasswordAction}>
            <div className="dash-field" style={{ marginBottom: 18 }}>
              <label htmlFor="password">New password</label>
              <input id="password" type="password" name="password" required minLength={8} autoComplete="new-password" autoFocus />
            </div>
            <SubmitButton variant="primary" pendingLabel="Updating…" style={{ width: "100%", justifyContent: "center" }}>
              Update password
            </SubmitButton>
          </form>
        )}
      </div>
    </div>
  );
}
