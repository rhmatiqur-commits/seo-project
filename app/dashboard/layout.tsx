import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import "./dashboard.css";

export const metadata = {
  title: "Client Portal",
};

/**
 * Phase 7.1A: loads Inter for real via next/font (self-hosted at build time
 * — no external font request at runtime, no separate dependency beyond
 * Next.js itself). Exposed as a CSS variable rather than swapped in via
 * `inter.className` so dashboard.css keeps ownership of the full font-family
 * fallback chain (`var(--font-inter), -apple-system, ...`) in one place.
 * Previously this file named "Inter" in the CSS font stack without ever
 * loading it, so `-apple-system`/`Segoe UI` matched first on every real
 * device and Inter never actually rendered.
 */
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

/**
 * The top-level /dashboard layout — deliberately minimal (just the
 * stylesheet + a `.dash` scoping wrapper). It does NOT render the
 * sidebar/nav shell: that's app/dashboard/[orgSlug]/layout.tsx's job, so
 * that auth pages (login/forgot-password/reset-password/accept-invite,
 * which have no organisation context yet) don't show a sidebar for an org
 * the visitor isn't even signed into yet.
 */
export default function DashboardRootLayout({ children }: { children: ReactNode }) {
  return <div className={`dash ${inter.variable}`}>{children}</div>;
}
