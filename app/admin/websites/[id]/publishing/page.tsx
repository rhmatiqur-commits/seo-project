import Link from "next/link";
import { notFound } from "next/navigation";
import { getWebsite } from "@/lib/db/websites";
import { getCmsConnectionForWebsite, getDecryptedCredential } from "@/lib/db/cms-connections";
import { listPublicationsForWebsite } from "@/lib/db/content-publications";
import { toPublicConnection } from "@/lib/publishing/connection-view";
import { GitHubClient, type GitHubRepoSummary } from "@/lib/publishing/github/client";
import { PersonalAccessTokenAuth } from "@/lib/publishing/github/auth";
import { connectCmsAction, testCmsConnectionAction, connectGitHubTokenAction, selectGitHubRepositoryAction } from "@/app/admin/actions";
import type { GithubPublicationMode, GithubContentAdapter } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

const PUBLICATION_MODES: GithubPublicationMode[] = ["GITHUB_PULL_REQUEST", "GITHUB_BRANCH_ONLY", "GITHUB_MERGE"];
const CONTENT_ADAPTERS: GithubContentAdapter[] = ["configurable_markdown", "cvcentral"];

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

      {connection?.provider === "github" ? (
        <GitHubConnectionSection website={{ id: website.id, organizationId: website.organization_id }} connectionRow={connectionRow!} connection={connection} />
      ) : (
        <WordPressConnectionSection website={{ id: website.id, organizationId: website.organization_id }} connection={connection} />
      )}

      {!connection && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Connect GitHub / Vercel</h2>
          <p className="muted">
            For code-based sites deployed via GitHub → Vercel (e.g. CV Central). GitHub is the source of truth — this platform
            never touches Vercel&apos;s production filesystem directly; Vercel deploys automatically from the GitHub changes
            this creates. A pull request is opened for review by default (<code>GITHUB_PULL_REQUEST</code>); nothing merges to
            production without an explicit <strong>Merge to Production</strong> click on the relevant content brief.
          </p>
          <p className="muted">
            Use a <strong>repository-scoped Personal Access Token</strong> (fine-grained, ideally limited to this one
            repository, with Contents + Pull requests read/write permissions), never a broad account-wide token. The stored
            token is encrypted (Supabase Vault) and is never shown again after saving.
          </p>
          <form action={connectGitHubTokenAction}>
            <input type="hidden" name="website_id" value={website.id} />
            <input type="hidden" name="organization_id" value={website.organization_id} />
            <label style={{ display: "block", maxWidth: "28rem" }}>
              GitHub Personal Access Token
              <br />
              <input type="password" name="token" placeholder="github_pat_..." style={{ width: "100%" }} required autoComplete="off" />
            </label>
            <p>
              <button className="btn secondary" type="submit">
                Connect GitHub
              </button>
            </p>
          </form>
        </div>
      )}

      <h2>Recent publications ({publications.length})</h2>
      <table>
        <thead>
          <tr>
            <th>Content version</th>
            <th>Type</th>
            <th>Status</th>
            <th>Target URL</th>
            <th>Branch / PR</th>
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
              <td className="muted">
                {p.branch_name && <div>{p.branch_name}</div>}
                {p.pull_request_url && (
                  <a href={p.pull_request_url} target="_blank" rel="noreferrer">
                    PR #{p.pull_request_number}
                  </a>
                )}
                {p.preview_url && (
                  <div>
                    <a href={p.preview_url} target="_blank" rel="noreferrer">
                      Preview &rarr;
                    </a>
                  </div>
                )}
              </td>
              <td className="muted">{fmt(p.published_at)}</td>
              <td className="muted">{p.error ?? ""}</td>
            </tr>
          ))}
          {publications.length === 0 && (
            <tr>
              <td colSpan={7} className="muted">
                No publications yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </>
  );
}

async function WordPressConnectionSection({
  website,
  connection,
}: {
  website: { id: string; organizationId: string };
  connection: Awaited<ReturnType<typeof toPublicConnection>> | null;
}) {
  if (connection && connection.provider !== "wordpress") return null;

  return (
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
            <input type="hidden" name="organization_id" value={website.organizationId} />
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
        <input type="hidden" name="organization_id" value={website.organizationId} />
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
  );
}

async function GitHubConnectionSection({
  website,
  connectionRow,
  connection,
}: {
  website: { id: string; organizationId: string };
  connectionRow: { status: string; credential_secret_id: string };
  connection: Awaited<ReturnType<typeof toPublicConnection>>;
}) {
  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>GitHub connection</h2>

      {connection.status !== "pending_repo_selection" && (
        <>
          <p>
            {connection.githubOwner && connection.githubRepo ? (
              <strong>
                {connection.githubOwner}/{connection.githubRepo}
              </strong>
            ) : (
              <span className="muted">No repository selected</span>
            )}{" "}
            &middot; production branch: <strong>{connection.githubProductionBranch ?? "-"}</strong> &middot; mode:{" "}
            <strong>{connection.githubPublicationMode}</strong> &middot; content adapter: <strong>{connection.contentAdapter}</strong> &middot;{" "}
            <span className={`badge ${connection.status}`}>{connection.status}</span>
          </p>
          {connection.githubAccountLogin && <p className="muted">Connected as GitHub user/org: {connection.githubAccountLogin}</p>}
          <p className="muted">
            Last tested: {fmt(connection.lastTestedAt)}
            {connection.lastTestError && ` — ${connection.lastTestError}`}
          </p>
          <div className="row">
            <form action={testCmsConnectionAction}>
              <input type="hidden" name="website_id" value={website.id} />
              <input type="hidden" name="organization_id" value={website.organizationId} />
              <button className="btn secondary" type="submit">
                Test Connection
              </button>
            </form>
          </div>
        </>
      )}

      {connection.status === "pending_repo_selection" && <RepoPicker websiteId={website.id} credentialSecretId={connectionRow.credential_secret_id} />}

      <h3>Reconnect with a different token</h3>
      <p className="muted">Saving a new token resets the selected repository — you&apos;ll need to pick it again below.</p>
      <form action={connectGitHubTokenAction}>
        <input type="hidden" name="website_id" value={website.id} />
        <input type="hidden" name="organization_id" value={website.organizationId} />
        <label style={{ display: "block", maxWidth: "28rem" }}>
          GitHub Personal Access Token
          <br />
          <input type="password" name="token" placeholder="github_pat_..." style={{ width: "100%" }} required autoComplete="off" />
        </label>
        <p>
          <button className="btn secondary" type="submit">
            Update token
          </button>
        </p>
      </form>
    </div>
  );
}

/** Lists repositories live from the GitHub API during render (spec: "do not
 * require the user to manually enter a repository URL if the GitHub API
 * can provide it") — same async-server-component pattern
 * app/admin/websites/[id]/search-console/page.tsx's SitePicker already
 * uses for Google's site list. The token is decrypted server-side only,
 * never sent to the browser. */
async function RepoPicker({ websiteId, credentialSecretId }: { websiteId: string; credentialSecretId: string }) {
  let repos: GitHubRepoSummary[] = [];
  let accountLogin = "";
  let loadError: string | null = null;
  try {
    const token = await getDecryptedCredential(credentialSecretId);
    const client = new GitHubClient(new PersonalAccessTokenAuth(token));
    const [user, repoList] = await Promise.all([client.getAuthenticatedUser(), client.listRepositories()]);
    accountLogin = user.login;
    repos = repoList;
  } catch (error) {
    loadError = error instanceof Error ? error.message : String(error);
  }

  return (
    <div>
      <h3>Choose a repository</h3>
      <p className="muted">Repositories your token can access, most recently pushed first.</p>
      {loadError && <p className="notice">Could not list repositories: {loadError}</p>}
      {!loadError && repos.length === 0 && <p className="muted">No accessible repositories found for this token.</p>}
      {!loadError && repos.length > 0 && (
        <form action={selectGitHubRepositoryAction} className="row" style={{ alignItems: "flex-start" }}>
          <input type="hidden" name="website_id" value={websiteId} />
          <input type="hidden" name="account_login" value={accountLogin} />
          <label>
            Repository
            <br />
            <select name="repo_full_name" defaultValue="" required>
              <option value="" disabled>
                Select a repository
              </option>
              {repos.map((r) => (
                <option key={r.fullName} value={r.fullName}>
                  {r.fullName} {r.private ? "(private)" : ""} — default branch: {r.defaultBranch}
                </option>
              ))}
            </select>
          </label>
          <label>
            Production branch
            <br />
            <input type="text" name="production_branch" placeholder="main" defaultValue={repos[0]?.defaultBranch ?? "main"} required />
            <br />
            <span className="muted">Adjust to match your selected repository&apos;s default branch, shown above.</span>
          </label>
          <label>
            Publication mode
            <br />
            <select name="publication_mode" defaultValue="GITHUB_PULL_REQUEST">
              {PUBLICATION_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {mode}
                </option>
              ))}
            </select>
          </label>
          <label>
            Content adapter
            <br />
            <select name="content_adapter" defaultValue="configurable_markdown">
              {CONTENT_ADAPTERS.map((adapter) => (
                <option key={adapter} value={adapter}>
                  {adapter}
                </option>
              ))}
            </select>
          </label>
          <button className="btn" type="submit" style={{ alignSelf: "flex-end" }}>
            Connect this repository
          </button>
        </form>
      )}
      <p className="muted" style={{ marginTop: "8px" }}>
        Default and safest: <code>GITHUB_PULL_REQUEST</code> — every change opens a pull request for review; nothing merges to
        production automatically. See the repository list above for each repo&apos;s own default branch.
      </p>
      <p className="muted">
        Content adapter decides how a page is generated/patched for this specific repository&apos;s structure —{" "}
        <code>configurable_markdown</code> is a generic Markdown+frontmatter adapter (works for most static-site setups);{" "}
        <code>cvcentral</code> is built specifically for the real rhmatiqur-commits/cvcentral repository (static HTML blog
        posts, no build step). Pick <code>cvcentral</code> only when connecting that exact repository.
      </p>
    </div>
  );
}
