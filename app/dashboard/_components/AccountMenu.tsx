import type { ReactNode } from "react";
import { signOutAction } from "@/app/dashboard/auth-actions";
import { SubmitButton } from "@/app/dashboard/_components/SubmitButton";

export interface AccountMenuProps {
  email: string;
  orgSlug: string;
  /** The trigger content (avatar+name block in the sidebar footer, or just
   * an avatar circle in the topbar) — whatever should open the menu. */
  trigger: ReactNode;
  align?: "up" | "down";
}

/**
 * A native <details>/<summary> disclosure, not a client component — no
 * "use client", no useState. Consistent with the rest of this codebase's
 * zero-unnecessary-client-JS convention, and with the workspace switcher
 * right above it in the sidebar. There's no separate personal "Account"
 * page anywhere in this app (signup only ever collects a password, never a
 * display name — see app/dashboard/auth-actions.ts), so rather than invent
 * one, the menu's own header line *is* the account summary: who you're
 * signed in as. Settings and Sign out are the two real destinations that
 * already exist.
 */
export function AccountMenu({ email, orgSlug, trigger, align = "down" }: AccountMenuProps) {
  return (
    <details className={`dash-account-menu ${align === "up" ? "align-up" : "align-down"}`}>
      <summary>{trigger}</summary>
      <div className="dash-account-menu-panel">
        <div className="dash-account-menu-identity">
          <div className="dash-muted" style={{ fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Signed in as
          </div>
          <div style={{ fontWeight: 600, fontSize: "0.85rem", overflow: "hidden", textOverflow: "ellipsis" }}>{email}</div>
        </div>
        <a className="dash-account-menu-item" href={`/dashboard/${orgSlug}/settings`}>
          Settings
        </a>
        <form action={signOutAction}>
          <SubmitButton variant="ghost" pendingLabel="Signing out…" style={{ width: "100%", justifyContent: "flex-start", padding: "8px 10px" }}>
            Sign out
          </SubmitButton>
        </form>
      </div>
    </details>
  );
}
