"use client";

import { useEffect } from "react";

/**
 * Shared error boundary for every page nested under
 * app/dashboard/[orgSlug]/** — before this, an unexpected exception (or a
 * deliberately thrown validation error like "This organisation must keep
 * at least one owner") fell through to Next's generic, unbranded error
 * page. Next.js requires error.tsx to be a Client Component.
 *
 * `error.message` is shown as-is: every throw in app/dashboard/actions.ts
 * and lib/auth/session.ts is already a deliberately human-readable,
 * user-safe sentence (e.g. permission/validation errors) — never a raw
 * driver/stack-trace string — so there is nothing further to redact here.
 * `error.digest` (an opaque Next.js correlation id, never the message or
 * stack) is shown faintly for support reference only.
 */
export default function OrganizationDashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[dashboard]", error);
  }, [error]);

  const message = error.message && error.message.length < 300 ? error.message : "Something went wrong loading this page.";

  return (
    <div className="dash-card" style={{ maxWidth: 480, margin: "48px auto" }}>
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
  );
}
