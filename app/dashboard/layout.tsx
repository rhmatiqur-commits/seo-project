import type { ReactNode } from "react";
import "./dashboard.css";

export const metadata = {
  title: "Client Portal",
};

/**
 * The top-level /dashboard layout — deliberately minimal (just the
 * stylesheet + a `.dash` scoping wrapper). It does NOT render the
 * sidebar/nav shell: that's app/dashboard/[orgSlug]/layout.tsx's job, so
 * that auth pages (login/forgot-password/reset-password/accept-invite,
 * which have no organisation context yet) don't show a sidebar for an org
 * the visitor isn't even signed into yet.
 */
export default function DashboardRootLayout({ children }: { children: ReactNode }) {
  return <div className="dash">{children}</div>;
}
