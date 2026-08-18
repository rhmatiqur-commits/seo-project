"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { signOutAction } from "@/app/dashboard/auth-actions";
import { SubmitButton } from "@/app/dashboard/_components/SubmitButton";

export interface MobileNavItem {
  href: string;
  label: string;
  icon?: ReactNode;
  count?: number;
}

export interface MobileNavSection {
  label: string;
  items: MobileNavItem[];
}

export interface MobileNavSwitcherEntry {
  slug: string;
  name: string;
}

export interface MobileNavProps {
  orgName: string;
  role: string;
  email: string;
  orgSlug: string;
  sections: MobileNavSection[];
  switcher?: MobileNavSwitcherEntry[];
}

/**
 * Phase 7.1A's hamburger → slide-over drawer, polished in 7.1B to carry
 * the same hierarchy as the desktop sidebar: workspace identity, grouped
 * sections with icons and attention counts, Settings, and the signed-in
 * user's own identity + sign out — the mobile drawer checklist from the
 * 7.1B spec. Escape/backdrop-close and the body-scroll lock are unchanged
 * from 7.1A.
 */
export function MobileNav({ orgName, role, email, orgSlug, sections, switcher }: MobileNavProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return (
    <>
      <button type="button" className="dash-hamburger" aria-label="Open navigation" aria-expanded={open} onClick={() => setOpen(true)}>
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <path d="M2 4.5h14M2 9h14M2 13.5h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <div className="dash-drawer-overlay" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="dash-drawer" role="dialog" aria-modal="true" aria-label="Navigation">
            <div className="dash-drawer-head">
              <div className="dash-drawer-workspace">
                <div className="dash-workspace-name">{orgName}</div>
                <div className="dash-workspace-sub">SEO Workspace</div>
              </div>
              <button type="button" className="dash-drawer-close" aria-label="Close navigation" onClick={() => setOpen(false)}>
                &times;
              </button>
            </div>

            {switcher && switcher.length > 1 && (
              <div style={{ marginBottom: 10 }}>
                <div className="dash-nav-section" style={{ padding: "0 8px 4px" }}>
                  Switch organisation
                </div>
                {switcher.map((org) => (
                  <Link
                    key={org.slug}
                    href={`/dashboard/${org.slug}`}
                    className={`dash-nav-link${org.slug === orgSlug ? " active" : ""}`}
                    onClick={() => setOpen(false)}
                  >
                    {org.name}
                  </Link>
                ))}
              </div>
            )}

            {sections.map((section, i) => (
              <div key={i}>
                {section.label && <div className="dash-nav-section">{section.label}</div>}
                {section.items.map((item) => (
                  <Link key={item.href} href={`/dashboard/${orgSlug}${item.href}`} className="dash-nav-link" onClick={() => setOpen(false)}>
                    {item.icon && <span className="icon">{item.icon}</span>}
                    {item.label}
                    {typeof item.count === "number" && item.count > 0 && <span className="count">{item.count}</span>}
                  </Link>
                ))}
              </div>
            ))}

            <div className="dash-drawer-footer">
              <div className="dash-footer-identity" style={{ padding: "8px" }}>
                <span className="dash-avatar" aria-hidden="true">
                  {email.slice(0, 2)}
                </span>
                <div className="dash-footer-identity-text">
                  <div className="dash-footer-identity-name">{email}</div>
                  <div className="dash-footer-identity-role">{role}</div>
                </div>
              </div>
              <form action={signOutAction}>
                <SubmitButton variant="ghost" pendingLabel="Signing out…" style={{ width: "100%", justifyContent: "flex-start" }}>
                  Sign out
                </SubmitButton>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
