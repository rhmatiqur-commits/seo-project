import Link from "next/link";
import { ChevronDownIcon } from "@/app/dashboard/_components/icons";

export interface WorkspaceSwitcherEntry {
  slug: string;
  name: string;
}

export interface WorkspaceSwitcherProps {
  orgName: string;
  orgSlug: string;
  organizations: WorkspaceSwitcherEntry[];
}

/**
 * Pinned at the top of the sidebar. A native <details>/<summary> dropdown
 * (no client JS) when there's more than one organisation to switch
 * between; a plain static block otherwise — no chevron, nothing to click,
 * since there's nowhere to go. Switching organisations here is just
 * navigating to /dashboard/[slug] — the exact same link the old plain
 * list used; requireOrganizationMembership re-derives and re-checks
 * membership for whichever org the link lands on, same as always.
 */
export function WorkspaceSwitcher({ orgName, orgSlug, organizations }: WorkspaceSwitcherProps) {
  if (organizations.length <= 1) {
    return (
      <div className="dash-workspace-switcher static">
        <div className="dash-workspace-name">{orgName}</div>
        <div className="dash-workspace-sub">SEO Workspace</div>
      </div>
    );
  }

  return (
    <details className="dash-workspace-switcher">
      <summary>
        <div>
          <div className="dash-workspace-name">{orgName}</div>
          <div className="dash-workspace-sub">SEO Workspace</div>
        </div>
        <ChevronDownIcon className="dash-workspace-chevron" />
      </summary>
      <div className="dash-workspace-panel">
        {organizations.map((org) => (
          <Link key={org.slug} href={`/dashboard/${org.slug}`} className={`dash-nav-link${org.slug === orgSlug ? " active" : ""}`}>
            {org.name}
          </Link>
        ))}
      </div>
    </details>
  );
}
