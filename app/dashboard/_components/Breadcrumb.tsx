"use client";

import { usePathname } from "next/navigation";

export interface BreadcrumbSection {
  href: string;
  label: string;
}

export interface BreadcrumbProps {
  orgName: string;
  orgSlug: string;
  sections: BreadcrumbSection[];
}

/**
 * "Org / Section" in the topbar — needs the current pathname, which a
 * Server Component layout has no supported way to read, hence the one
 * small client component here (read-only: no state, no effects besides
 * Next's own usePathname subscription).
 *
 * Deliberately two levels, not the three the spec's own example shows
 * ("CV Central / Content / International CV Guide"): a third, entity-
 * specific level needs that entity's title, which only the leaf page
 * itself fetches — surfacing it in a layout-level breadcrumb would need a
 * cross-component title registry (a client Context each page writes into)
 * that's out of scope for this pass. Flagged in the completion report
 * rather than half-built.
 */
export function Breadcrumb({ orgName, orgSlug, sections }: BreadcrumbProps) {
  const pathname = usePathname();
  const base = `/dashboard/${orgSlug}`;
  const current = sections.find((s) => (s.href === "" ? pathname === base : pathname.startsWith(`${base}${s.href}`)));

  return (
    <div className="dash-breadcrumb">
      <span>{orgName}</span>
      {current && (
        <>
          <span className="sep">/</span>
          <span className="current">{current.label}</span>
        </>
      )}
    </div>
  );
}
