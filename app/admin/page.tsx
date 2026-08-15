import Link from "next/link";
import { listOrganizations } from "@/lib/db/organizations";
import { createOrganizationAction } from "@/app/admin/actions";

export const dynamic = "force-dynamic";

export default async function AdminHomePage() {
  const organizations = await listOrganizations();

  return (
    <>
      <h1>Organizations</h1>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Create organization</h2>
        <form action={createOrganizationAction} className="row">
          <input type="text" name="name" placeholder="e.g. CV Central" required />
          <button className="btn" type="submit">
            Create
          </button>
        </form>
      </div>

      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Slug</th>
            <th>Created</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {organizations.map((org) => (
            <tr key={org.id}>
              <td>{org.name}</td>
              <td className="muted">{org.slug}</td>
              <td className="muted">{new Date(org.created_at).toLocaleString()}</td>
              <td>
                <Link className="btn secondary" href={`/admin/organizations/${org.id}`}>
                  Open
                </Link>
              </td>
            </tr>
          ))}
          {organizations.length === 0 && (
            <tr>
              <td colSpan={4} className="muted">
                No organizations yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </>
  );
}
