import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser, listCurrentUserMemberships } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** `/dashboard` itself is never the final destination — it resolves to the
 * signed-in user's organisation (redirecting straight there when there's
 * only one, the common case) or offers a picker when there's more than
 * one. Every actual page lives under /dashboard/[orgSlug]/**. */
export default async function DashboardEntryPage() {
  await requireUser("/dashboard");
  const memberships = await listCurrentUserMemberships();

  if (memberships.length === 1) {
    redirect(`/dashboard/${memberships[0]!.organization.slug}`);
  }

  return (
    <div className="dash-auth-page">
      <div className="dash-card" style={{ maxWidth: 480, width: "100%" }}>
        <h1 className="dash-page-title">Choose an organisation</h1>
        {memberships.length === 0 && <p className="dash-muted">You don&apos;t belong to any organisation yet. Ask an administrator to invite you.</p>}
        {memberships.map(({ organization, role }) => (
          <p key={organization.id}>
            <Link className="dash-btn secondary" href={`/dashboard/${organization.slug}`} style={{ width: "100%", justifyContent: "space-between" }}>
              {organization.name} <span className="dash-badge">{role}</span>
            </Link>
          </p>
        ))}
      </div>
    </div>
  );
}
