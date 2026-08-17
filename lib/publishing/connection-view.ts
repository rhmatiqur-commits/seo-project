/**
 * The one place that decides what a cms_connections row is allowed to look
 * like once it leaves the server — used by every admin page/action that
 * renders connection status. A structural (not DB-row-typed) input so this
 * stays a pure, dependency-free function: any object with these fields
 * works, including the real Database row. credential_secret_id is
 * deliberately never a field on CmsConnectionPublicView — there is no path
 * through this function that can leak it, by construction, not by care.
 * The same is true of the raw GitHub token: only github_owner/repo/branch/
 * account_login (all non-sensitive, display-only identifiers) ever appear
 * here, never the decrypted credential itself.
 */

export interface CmsConnectionRowLike {
  id: string;
  provider: string;
  base_url: string | null;
  username: string | null;
  github_owner: string | null;
  github_repo: string | null;
  github_production_branch: string | null;
  github_account_login: string | null;
  github_publication_mode: string;
  status: string;
  last_tested_at: string | null;
  last_test_error: string | null;
}

export interface CmsConnectionPublicView {
  id: string;
  provider: string;
  baseUrl: string | null;
  username: string | null;
  githubOwner: string | null;
  githubRepo: string | null;
  githubProductionBranch: string | null;
  githubAccountLogin: string | null;
  githubPublicationMode: string;
  status: string;
  lastTestedAt: string | null;
  lastTestError: string | null;
}

export function toPublicConnection(row: CmsConnectionRowLike): CmsConnectionPublicView {
  return {
    id: row.id,
    provider: row.provider,
    baseUrl: row.base_url,
    username: row.username,
    githubOwner: row.github_owner,
    githubRepo: row.github_repo,
    githubProductionBranch: row.github_production_branch,
    githubAccountLogin: row.github_account_login,
    githubPublicationMode: row.github_publication_mode,
    status: row.status,
    lastTestedAt: row.last_tested_at,
    lastTestError: row.last_test_error,
  };
}
