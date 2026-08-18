"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export interface MobileNavSection {
  label: string;
  items: { href: string; label: string }[];
}

export interface MobileNavSwitcherEntry {
  slug: string;
  name: string;
}

export interface MobileNavProps {
  orgName: string;
  role: string;
  orgSlug: string;
  sections: MobileNavSection[];
  switcher?: MobileNavSwitcherEntry[];
}

/**
 * Replaces the old "collapse the sidebar into a horizontally-scrolling
 * strip" mobile pattern (easy to not notice it scrolls, easy to miss items
 * off-screen) with a standard hamburger → slide-over drawer exposing every
 * nav item. Desktop is untouched — the existing `<aside className="dash-
 * sidebar">` in the layout keeps rendering exactly as before; this only
 * shows below the 860px breakpoint (see dashboard.css).
 */
export function MobileNav({ orgName, role, orgSlug, sections, switcher }: MobileNavProps) {
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
              <div className="dash-brand" style={{ padding: 0 }}>
                {orgName}
                <small>{role}</small>
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
                    {item.label}
                  </Link>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
