import type { ReactNode } from "react";
import Link from "next/link";
import { requireOrganizationMembership, listCurrentUserMemberships } from "@/lib/auth/session";
import { signOutAction } from "@/app/dashboard/auth-actions";

const NAV_SECTIONS: Array<{ label: string; items: Array<{ href: string; label: string }> }> = [
  { label: "", items: [{ href: "", label: "Overview" }] },
  {
    label: "SEO Work",
    items: [
      { href: "/opportunities", label: "Opportunities" },
      { href: "/tasks", label: "Tasks" },
      { href: "/content", label: "Content" },
      { href: "/publishing", label: "Publishing" },
      { href: "/outcomes", label: "Outcomes" },
    ],
  },
  {
    label: "Insights",
    items: [
      { href: "/audit", label: "SEO Audit" },
      { href: "/search-console", label: "Search Console" },
      { href: "/keywords", label: "Keywords" },
      { href: "/competitors", label: "Competitors" },
      { href: "/reports", label: "Reports" },
    ],
  },
  { label: "", items: [{ href: "/settings", label: "Settings" }] },
];

/**
 * Every /dashboard/[orgSlug]/** page is a child of this layout, so the
 * membership check (lib/auth/session.ts's requireOrganizationMembership —
 * server-side, backed by RLS) runs once here per request as the primary
 * gate. Individual pages/actions still re-derive their own context rather
 * than trusting a prop passed down from here (same "each page independently
 * loads its own data" convention /admin already uses) — this layout's own
 * check is about not rendering the shell/nav at all for a non-member, not
 * the only place access is enforced.
 */
export default async function OrganizationDashboardLayout({ children, params }: { children: ReactNode; params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { user, organization, membership } = await requireOrganizationMembership(orgSlug);
  const memberships = await listCurrentUserMemberships();

  return (
    <div className="dash-shell">
      <aside className="dash-sidebar">
        <div className="dash-brand">
          {organization.name}
          <small>{membership.role}</small>
        </div>
        {memberships.length > 1 && (
          <div style={{ marginBottom: 10 }}>
            <div className="dash-nav-section" style={{ padding: "0 10px 4px" }}>
              Switch organisation
            </div>
            {memberships.map((m) => (
              <Link
                key={m.organization.id}
                href={`/dashboard/${m.organization.slug}`}
                className={`dash-nav-link${m.organization.slug === orgSlug ? " active" : ""}`}
              >
                {m.organization.name}
              </Link>
            ))}
          </div>
        )}
        {NAV_SECTIONS.map((section, i) => (
          <div key={i}>
            {section.label && <div className="dash-nav-section">{section.label}</div>}
            {section.items.map((item) => (
              <Link key={item.href} href={`/dashboard/${orgSlug}${item.href}`} className="dash-nav-link">
                {item.label}
              </Link>
            ))}
          </div>
        ))}
      </aside>
      <div className="dash-content">
        <div className="dash-topbar">
          <span className="dash-muted" style={{ fontSize: "0.85rem" }}>
            {user.email}
          </span>
          <form action={signOutAction}>
            <button className="dash-btn secondary" type="submit">
              Sign out
            </button>
          </form>
        </div>
        <div className="dash-main">{children}</div>
      </div>
    </div>
  );
}
