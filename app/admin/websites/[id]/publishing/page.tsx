import Link from "next/link";
import { notFound } from "next/navigation";
import { getWebsite } from "@/lib/db/websites";
import { getCmsConnectionForWebsite } from "@/lib/db/cms-connections";
import { listPublicationsForWebsite } from "@/lib/db/content-publications";
import { toPublicConnection } from "@/lib/publishing/connection-view";
import { connectCmsAction, testCmsConnectionAction } from "@/app/admin/actions";

export const dynamic = "force-dynamic";

function fmt(date: string | null): string {
  return date ? new Date(date).toLocaleString() : "-";
}

export default async function WebsitePublishingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const website = await getWebsite(id);
  if (!website) notFound();

  const [connectionRow, publications] = await Promise.all([getCmsConnectionForWebsite(website.id), listPublicationsForWebsite(website.id)]);
  const connection = connectionRow ? toPublicConnection(connectionRow) : null;

  return (
    <>
      <p className="row">
        <Link href={`/admin/websites/${website.id}`}>&larr; {website.name}</Link>
      </p>
      <h1>Publishing — {website.name}</h1>
      <div className="notice">
        Approved content only. Publishing requires content to reach <span className="badge APPROVED">APPROVED</span> on its
        brief page first — there is no path from AI-generated content to a live page without that human approval step.
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>WordPress connection</h2>
        {connection ? (
          <>
            <p>
              <strong>{connection.baseUrl}</strong> ({connection.username}) &middot; <span className={`badge ${connection.status}`}>{connection.status}</span>
            </p>
            <p className="muted">
              Last tested: {fmt(connection.lastTestedAt)}
              {connection.lastTestError && ` — ${connection.lastTestError}`}
            </p>
            <form action={testCmsConnectionAction} className="row">
              <input type="hidden" name="website_id" value={website.id} />
              <input type="hidden" name="organization_id" value={website.organization_id} />
              <button className="btn secondary" type="submit">
                Test Connection
              </button>
            </form>
          </>
        ) : (
          <p className="muted">No WordPress site connected yet.</p>
        )}

        <h3>{connection ? "Reconnect / update credentials" : "Connect WordPress"}</h3>
        <p className="muted">
          Use a <strong>WordPress Application Password</strong> (WordPress Admin → Users → Profile → Application
          Passwords), never the account&apos;s normal login password. The stored credential is encrypted (Supabase
          Vault) and is never shown again after saving.
        </p>
        <form action={connectCmsAction}>
          <input type="hidden" name="website_id" value={website.id} />
          <input type="hidden" name="organization_id" value={website.organization_id} />
          <div className="row" style={{ alignItems: "flex-start" }}>
            <label style={{ flex: 1, minWidth: "16rem" }}>
              WordPress site URL
              <br />
              <input type="url" name="base_url" placeholder="https://cvcentral.io" defaultValue={connection?.baseUrl ?? ""} style={{ width: "100%" }} required />
            </label>
            <label style={{ flex: 1, minWidth: "12rem" }}>
              Username
              <br />
              <input type="text" name="username" placeholder="seo-bot" defaultValue={connection?.username ?? ""} style={{ width: "100%" }} required />
            </label>
            <label style={{ flex: 1, minWidth: "16rem" }}>
              Application Password
              <br />
              <input type="password" name="application_password" placeholder="xxxx xxxx xxxx xxxx xxxx xxxx" style={{ width: "100%" }} required autoComplete="off" />
            </label>
          </div>
          <p>
            <button className="btn" type="submit">
              {connection ? "Update connection" : "Connect"}
            </button>
          </p>
        </form>
      </div>

      <h2>Recent publications ({publications.length})</h2>
      <table>
        <thead>
          <tr>
            <th>Content version</th>
            <th>Type</th>
            <th>Status</th>
            <th>Target URL</th>
            <th>Published</th>
            <th>Error</th>
          </tr>
        </thead>
        <tbody>
          {publications.map((p) => (
            <tr key={p.id}>
              <td className="muted">{p.content_version_id}</td>
              <td className="muted">{p.publication_type}</td>
              <td>
                <span className={`badge ${p.status}`}>{p.status}</span>
              </td>
              <td>
                {p.target_url ? (
                  <a href={p.target_url} target="_blank" rel="noreferrer">
                    {p.target_url}
                  </a>
                ) : (
                  "-"
                )}
              </td>
              <td className="muted">{fmt(p.published_at)}</td>
              <td className="muted">{p.error ?? ""}</td>
            </tr>
          ))}
          {publications.length === 0 && (
            <tr>
              <td colSpan={6} className="muted">
                No publications yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </>
  );
}
