import type { ReactNode } from "react";
import Link from "next/link";
import { requireOrganizationMembership, listCurrentUserMemberships } from "@/lib/auth/session";
import { getPrimaryWebsiteForOrganization } from "@/lib/dashboard/website";
import { listOpportunitiesForWebsite } from "@/lib/db/opportunities";
import { listIssuesForWebsite } from "@/lib/db/audits";
import { listContentJobsForWebsite } from "@/lib/db/content";
import { computeAttentionCounts, type AttentionCounts } from "@/lib/dashboard/attention";
import { MobileNav } from "@/app/dashboard/_components/MobileNav";
import { WorkspaceSwitcher } from "@/app/dashboard/_components/WorkspaceSwitcher";
import { AccountMenu } from "@/app/dashboard/_components/AccountMenu";
import { Breadcrumb } from "@/app/dashboard/_components/Breadcrumb";
import { DismissibleDetails } from "@/app/dashboard/_components/DismissibleDetails";
import {
  OverviewIcon,
  OpportunitiesIcon,
  TasksIcon,
  AuditIcon,
  ContentIcon,
  PublishingIcon,
  PerformanceIcon,
  SearchConsoleIcon,
  KeywordsIcon,
  CompetitorsIcon,
  ReportsIcon,
  SettingsIcon,
} from "@/app/dashboard/_components/icons";
import type { JSX } from "react";

interface NavItem {
  href: string;
  label: string;
  icon: JSX.Element;
  countKey?: keyof AttentionCounts;
}
interface NavSection {
  label: string;
  items: NavItem[];
}

/**
 * Phase 7.1B grouping: Workspace/SEO/Content/Insights, matching the
 * client's own mental model (what am I deciding vs. what am I reading)
 * rather than how the code happens to be organised. Audit moved out of
 * "Insights" into "SEO" (it's a decision queue, not a report); Outcomes
 * moved into "Insights". Phase 7.1F: renamed this nav label from
 * "Performance" back to "Outcomes" (matching the page's own heading) —
 * it sat next to "Reports" with near-identical scope and no way to tell
 * them apart by name alone; the route (/outcomes) is unchanged. See
 * lib/dashboard/status-labels.ts for the separate client-language pass on
 * the *statuses* individual pages render.
 */
const NAV_SECTIONS: NavSection[] = [
  { label: "Workspace", items: [{ href: "", label: "Overview", icon: <OverviewIcon /> }] },
  {
    label: "SEO",
    items: [
      { href: "/opportunities", label: "Opportunities", icon: <OpportunitiesIcon />, countKey: "opportunities" },
      { href: "/tasks", label: "Tasks", icon: <TasksIcon /> },
      { href: "/audit", label: "Audit", icon: <AuditIcon />, countKey: "audit" },
    ],
  },
  {
    label: "Content",
    items: [
      { href: "/content", label: "Content", icon: <ContentIcon />, countKey: "content" },
      { href: "/publishing", label: "Publishing", icon: <PublishingIcon /> },
    ],
  },
  {
    label: "Insights",
    items: [
      { href: "/outcomes", label: "Outcomes", icon: <PerformanceIcon /> },
      { href: "/search-console", label: "Search Console", icon: <SearchConsoleIcon /> },
      { href: "/keywords", label: "Keywords", icon: <KeywordsIcon /> },
      { href: "/competitors", label: "Competitors", icon: <CompetitorsIcon /> },
      { href: "/reports", label: "Reports", icon: <ReportsIcon /> },
    ],
  },
  { label: "", items: [{ href: "/settings", label: "Settings", icon: <SettingsIcon /> }] },
];

function initialsFromEmail(email: string): string {
  const local = email.split("@")[0] ?? email;
  return local.slice(0, 2).toUpperCase();
}

/**
 * Every /dashboard/[orgSlug]/** page is a child of this layout, so the
 * membership check (lib/auth/session.ts's requireOrganizationMembership —
 * server-side, backed by RLS) runs once here per request as the primary
 * gate. Individual pages/actions still re-derive their own context rather
 * than trusting a prop passed down from here (same "each page independently
 * loads its own data" convention /admin already uses) — this layout's own
 * check is about not rendering the shell/nav at all for a non-member, not
 * the only place access is enforced.
 *
 * Phase 7.1B additionally fetches the same three lists Home already reads
 * (open opportunities, open issues, pending-approval content jobs) purely
 * to compute the sidebar's quiet attention counts — no new query logic, no
 * new metric; see lib/dashboard/attention.ts. Those three queries now run
 * once per navigation in addition to whatever the leaf page itself
 * fetches — the same "every layer loads its own data" tradeoff the rest
 * of this app already makes, not a new one.
 */
export default async function OrganizationDashboardLayout({ children, params }: { children: ReactNode; params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { user, organization, membership } = await requireOrganizationMembership(orgSlug);
  const memberships = await listCurrentUserMemberships();
  const website = await getPrimaryWebsiteForOrganization(organization.id);

  const [opportunities, issues, pendingApprovalContentJobs] = website
    ? await Promise.all([
        listOpportunitiesForWebsite(website.id),
        listIssuesForWebsite(website.id),
        listContentJobsForWebsite(website.id, "READY_FOR_APPROVAL"),
      ])
    : [[], [], []];
  const counts = computeAttentionCounts({ opportunities, issues, pendingApprovalContentJobs });

  const organizations = memberships.map((m) => ({ slug: m.organization.slug, name: m.organization.name }));
  const breadcrumbSections = NAV_SECTIONS.flatMap((s) => s.items.map((item) => ({ href: item.href, label: item.label })));

  return (
    <div className="dash-shell">
      <DismissibleDetails />
      <aside className="dash-sidebar">
        <WorkspaceSwitcher orgName={organization.name} orgSlug={orgSlug} organizations={organizations} />

        {NAV_SECTIONS.map((section, i) => (
          <div key={i}>
            {section.label && <div className="dash-nav-section">{section.label}</div>}
            {section.items.map((item) => {
              const count = item.countKey ? counts[item.countKey] : undefined;
              return (
                <Link key={item.href} href={`/dashboard/${orgSlug}${item.href}`} className="dash-nav-link">
                  <span className="icon">{item.icon}</span>
                  {item.label}
                  {typeof count === "number" && count > 0 && <span className="count">{count}</span>}
                </Link>
              );
            })}
          </div>
        ))}

        <div className="dash-sidebar-footer">
          <AccountMenu
            email={user.email ?? ""}
            orgSlug={orgSlug}
            align="up"
            trigger={
              <div className="dash-footer-identity" style={{ padding: "6px" }}>
                <span className="dash-avatar" aria-hidden="true">
                  {initialsFromEmail(user.email ?? "?")}
                </span>
                <div className="dash-footer-identity-text">
                  <div className="dash-footer-identity-name">{user.email}</div>
                  <div className="dash-footer-identity-role">{membership.role}</div>
                </div>
              </div>
            }
          />
        </div>
      </aside>
      <div className="dash-content">
        <div className="dash-topbar">
          <MobileNav
            orgName={organization.name}
            role={membership.role}
            email={user.email ?? ""}
            orgSlug={orgSlug}
            sections={NAV_SECTIONS.map((s) => ({
              label: s.label,
              items: s.items.map((item) => ({ href: item.href, label: item.label, icon: item.icon, count: item.countKey ? counts[item.countKey] : undefined })),
            }))}
            switcher={organizations}
          />
          <Breadcrumb orgName={organization.name} orgSlug={orgSlug} sections={breadcrumbSections} />
          <div className="dash-topbar-right">
            <AccountMenu
              email={user.email ?? ""}
              orgSlug={orgSlug}
              align="down"
              trigger={
                <span className="dash-topbar-avatar-trigger">
                  <span className="dash-avatar" aria-hidden="true">
                    {initialsFromEmail(user.email ?? "?")}
                  </span>
                </span>
              }
            />
          </div>
        </div>
        <div className="dash-main">{children}</div>
      </div>
    </div>
  );
}
