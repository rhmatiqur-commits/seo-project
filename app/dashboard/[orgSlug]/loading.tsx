import { DashboardPageSkeleton } from "@/app/dashboard/_components/Skeleton";

/**
 * Next.js shows this as the Suspense fallback for every page nested under
 * app/dashboard/[orgSlug]/** (opportunities, tasks, content, publishing,
 * outcomes, audit, search-console, keywords, competitors, reports,
 * settings, and the org home page itself) — one shared skeleton instead of
 * a blank flash between navigations, which is what every one of those
 * routes did before this (all force-dynamic, none had a loading.tsx).
 */
export default function OrganizationDashboardLoading() {
  return <DashboardPageSkeleton />;
}
