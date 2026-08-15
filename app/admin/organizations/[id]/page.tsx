import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrganization } from "@/lib/db/organizations";
import { listWebsitesForOrganization } from "@/lib/db/websites";
import { createWebsiteAction } from "@/app/admin/actions";

export const dynamic = "force-dynamic";

export default async function OrganizationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const organization = await getOrganization(id);
  if (!organization) notFound();
  const websites = await listWebsitesForOrganization(id);

  return (
    <>
      <p>
        <Link href="/admin">&larr; Organizations</Link>
      </p>
      <h1>{organization.name}</h1>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Add website</h2>
        <form action={createWebsiteAction} className="row">
          <input type="hidden" name="organization_id" value={organization.id} />
          <input type="text" name="name" placeholder="Website name" required />
          <input type="url" name="base_url" placeholder="https://example.com" required style={{ minWidth: 220 }} />
          <label className="muted">
            max pages <input type="number" name="crawl_max_pages" defaultValue={50} min={1} max={500} style={{ width: 70 }} />
          </label>
          <label className="muted">
            max depth <input type="number" name="crawl_max_depth" defaultValue={4} min={0} max={10} style={{ width: 60 }} />
          </label>
          <button className="btn" type="submit">
            Add website
          </button>
        </form>
      </div>

      <h2>Websites</h2>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Base URL</th>
            <th>Status</th>
            <th>Last crawled</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {websites.map((w) => (
            <tr key={w.id}>
              <td>{w.name}</td>
              <td>
                <a href={w.base_url} target="_blank" rel="noreferrer">
                  {w.base_url}
                </a>
              </td>
              <td>{w.status}</td>
              <td className="muted">{w.last_crawled_at ? new Date(w.last_crawled_at).toLocaleString() : "never"}</td>
              <td>
                <Link className="btn secondary" href={`/admin/websites/${w.id}`}>
                  Open
                </Link>
              </td>
            </tr>
          ))}
          {websites.length === 0 && (
            <tr>
              <td colSpan={5} className="muted">
                No websites yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </>
  );
}
