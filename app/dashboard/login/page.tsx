import { signInAction } from "@/app/dashboard/auth-actions";
import { SubmitButton } from "@/app/dashboard/_components/SubmitButton";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;

  return (
    <div className="dash-auth-page">
      <div className="dash-card dash-auth-card">
        <h1 className="dash-page-title">Sign in</h1>
        <p className="dash-page-subtitle">Access your SEO dashboard.</p>
        {error && <div className="dash-notice danger">{error}</div>}
        <form action={signInAction}>
          <input type="hidden" name="next" value={next ?? "/dashboard"} />
          <div className="dash-field" style={{ marginBottom: 14 }}>
            <label htmlFor="email">Email</label>
            <input id="email" type="email" name="email" required autoComplete="email" autoFocus />
          </div>
          <div className="dash-field" style={{ marginBottom: 18 }}>
            <label htmlFor="password">Password</label>
            <input id="password" type="password" name="password" required autoComplete="current-password" />
          </div>
          <SubmitButton variant="primary" pendingLabel="Signing in…" style={{ width: "100%", justifyContent: "center" }}>
            Sign in
          </SubmitButton>
        </form>
        <p style={{ marginTop: 16, fontSize: "0.85rem" }}>
          <a href="/dashboard/forgot-password">Forgot your password?</a>
        </p>
      </div>
    </div>
  );
}
