/**
 * The one place that decides what a cms_connections row is allowed to look
 * like once it leaves the server — used by every admin page/action that
 * renders connection status. A structural (not DB-row-typed) input so this
 * stays a pure, dependency-free function: any object with these fields
 * works, including the real Database row. credential_secret_id is
 * deliberately never a field on CmsConnectionPublicView — there is no path
 * through this function that can leak it, by construction, not by care.
 */

export interface CmsConnectionRowLike {
  id: string;
  provider: string;
  base_url: string;
  username: string;
  status: string;
  last_tested_at: string | null;
  last_test_error: string | null;
}

export interface CmsConnectionPublicView {
  id: string;
  provider: string;
  baseUrl: string;
  username: string;
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
    status: row.status,
    lastTestedAt: row.last_tested_at,
    lastTestError: row.last_test_error,
  };
}
