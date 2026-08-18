import { requestPasswordResetAction } from "@/app/dashboard/auth-actions";

export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ sent?: string }> }) {
  const { sent } = await searchParams;

  return (
    <div className="dash-auth-page">
      <div className="dash-card dash-auth-card">
        <h1 className="dash-page-title">Reset your password</h1>
        {sent ? (
          <p className="dash-page-subtitle">
            If an account exists for that email, we&apos;ve sent a link to reset your password. Check your inbox (and spam folder).
          </p>
        ) : (
          <>
            <p className="dash-page-subtitle">Enter your email and we&apos;ll send you a reset link.</p>
            <form action={requestPasswordResetAction}>
              <div className="dash-field" style={{ marginBottom: 18 }}>
                <label htmlFor="email">Email</label>
                <input id="email" type="email" name="email" required autoComplete="email" autoFocus />
              </div>
              <button className="dash-btn" type="submit" style={{ width: "100%", justifyContent: "center" }}>
                Send reset link
              </button>
            </form>
          </>
        )}
        <p style={{ marginTop: 16, fontSize: "0.85rem" }}>
          <a href="/dashboard/login">Back to sign in</a>
        </p>
      </div>
    </div>
  );
}
