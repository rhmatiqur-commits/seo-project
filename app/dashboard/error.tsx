"use client";

import { useEffect } from "react";

/** Shared error boundary for /dashboard and the auth pages (login,
 * forgot-password, reset-password, accept-invite) that sit outside
 * [orgSlug]'s own boundary. See app/dashboard/[orgSlug]/error.tsx for the
 * full rationale — identical treatment, kept as a separate file only
 * because Next.js scopes error.tsx per route segment. */
export default function DashboardRootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[dashboard]", error);
  }, [error]);

  const message = error.message && error.message.length < 300 ? error.message : "Something went wrong loading this page.";

  return (
    <div className="dash-auth-page">
      <div className="dash-card dash-auth-card">
        <h1 className="dash-page-title" style={{ fontSize: "1.15rem" }}>
          Something went wrong
        </h1>
        <p className="dash-muted" style={{ marginBottom: 18 }}>
          {message}
        </p>
        <button type="button" className="dash-btn" onClick={() => reset()}>
          Try again
        </button>
        {error.digest && (
          <p className="dash-muted" style={{ fontSize: "0.72rem", marginTop: 16, marginBottom: 0 }}>
            Reference: {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}
