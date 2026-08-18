/**
 * Phase 7.1B: one small, consistent inline-SVG icon per nav destination —
 * no icon library dependency (the spec's own constraint: "Do not introduce
 * a large icon dependency"). All 16x16, stroke-only, currentColor, so they
 * inherit whatever text colour the surrounding .dash-nav-link/.dash-badge
 * already sets (active/hover states need no icon-specific CSS).
 */
import type { SVGProps } from "react";

function Icon({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      {children}
    </svg>
  );
}

export function OverviewIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <rect x="2" y="2" width="5" height="5" rx="1" />
      <rect x="9" y="2" width="5" height="5" rx="1" />
      <rect x="2" y="9" width="5" height="5" rx="1" />
      <rect x="9" y="9" width="5" height="5" rx="1" />
    </Icon>
  );
}

export function OpportunitiesIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="8" cy="8" r="6" />
      <circle cx="8" cy="8" r="3" />
      <circle cx="8" cy="8" r="0.6" fill="currentColor" />
    </Icon>
  );
}

export function TasksIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" />
      <path d="M5 8l1.8 1.8L11 6" />
    </Icon>
  );
}

export function AuditIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="6.8" cy="6.8" r="4.3" />
      <path d="M10 10l3.5 3.5" />
    </Icon>
  );
}

export function ContentIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M4 2h5.5L12 4.5V13a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z" />
      <path d="M6 7h4M6 9.5h4" />
    </Icon>
  );
}

export function PublishingIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M8 11V3" />
      <path d="M5 6l3-3 3 3" />
      <path d="M3 11.5v1a1.5 1.5 0 001.5 1.5h7a1.5 1.5 0 001.5-1.5v-1" />
    </Icon>
  );
}

export function PerformanceIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M2.5 13V2.5" />
      <path d="M2.5 13h11" />
      <path d="M4.5 10.5l3-3 2 2 3.5-4" />
    </Icon>
  );
}

export function SearchConsoleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="8" cy="8" r="5.8" />
      <path d="M2.2 8h11.6M8 2.2c1.6 1.7 2.4 3.7 2.4 5.8s-.8 4.1-2.4 5.8c-1.6-1.7-2.4-3.7-2.4-5.8s.8-4.1 2.4-5.8z" />
    </Icon>
  );
}

export function KeywordsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M6.2 2.5H12a1 1 0 011 1v5.8a1 1 0 01-.3.7l-5.4 5.4a1 1 0 01-1.4 0L2.6 12a1 1 0 010-1.4l5.4-5.4a1 1 0 01.2-.2z" />
      <circle cx="9.6" cy="5.4" r="1" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function CompetitorsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M2.5 13V8.5M6.2 13V5M9.8 13V9.5M13.5 13V3" />
    </Icon>
  );
}

export function ReportsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <rect x="3" y="2" width="10" height="12" rx="1.2" />
      <path d="M5.5 6h5M5.5 8.5h5M5.5 11h3" />
    </Icon>
  );
}

export function SettingsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="8" cy="8" r="2.2" />
      <path d="M8 2.3v1.6M8 12.1v1.6M13.7 8h-1.6M3.9 8H2.3M11.9 4.1l-1.1 1.1M5.2 10.7l-1.1 1.1M11.9 11.9l-1.1-1.1M5.2 5.3L4.1 4.2" />
    </Icon>
  );
}

export function ChevronDownIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M3 4.5L6 7.5L9 4.5" />
    </svg>
  );
}

export function ChevronRightIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M4.5 3L7.5 6L4.5 9" />
    </svg>
  );
}
