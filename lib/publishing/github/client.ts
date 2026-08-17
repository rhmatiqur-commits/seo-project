import { mapGitHubError } from "@/lib/publishing/github/errors";
import { GITHUB_REQUEST_TIMEOUT_MS, GITHUB_REPO_LIST_PER_PAGE, GITHUB_PR_LOOKUP_PER_PAGE } from "@/lib/publishing/limits";
import type { GitHubAuthStrategy } from "@/lib/publishing/github/auth";

/**
 * Hand-rolled `fetch` client for the GitHub REST API (v3, `application/
 * vnd.github+json`) — no SDK, same philosophy as the crawler/Search Console/
 * DataForSEO/WordPress clients already in this codebase. Deliberately thin:
 * every method maps directly onto one GitHub endpoint and returns a small,
 * typed shape; every *decision* (does this already exist, should we retry,
 * which mode is configured) lives in lib/publishing/github/retry-strategy.ts
 * and lib/publishing/github-provider.ts, not here.
 *
 * Credentials: the Authorization header is built fresh from the injected
 * GitHubAuthStrategy on every request (never cached on the instance as a
 * plain string) and is never included in a thrown error message — every
 * error path strips the request down to status/detail before mapping it.
 */

export interface GitHubRepoSummary {
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  private: boolean;
  htmlUrl: string;
}

export interface GitHubFileContent {
  path: string;
  content: string;
  sha: string;
}

export interface GitHubPullRequestSummary {
  number: number;
  htmlUrl: string;
  state: "open" | "closed";
  merged: boolean;
  /** null until GitHub has finished computing mergeability — callers should treat null as "unknown, check again". */
  mergeable: boolean | null;
  headSha: string;
  headRef: string;
  baseRef: string;
}

export interface GitHubMergeResult {
  merged: boolean;
  sha: string | null;
  message: string;
}

export interface GitHubDeploymentSignal {
  /** Combined state from the classic Statuses API ("success"/"pending"/"failure"/"error"), when any statuses exist. */
  combinedState: string | null;
  /** Best-effort: a Vercel preview URL detected from a status/check-run whose context/app name mentions "vercel" — never fetched via the Vercel API itself (see README's Vercel section). */
  vercelPreviewUrl: string | null;
  vercelState: string | null;
}

interface RawRepo {
  name: string;
  full_name: string;
  owner: { login: string };
  default_branch: string;
  private: boolean;
  html_url: string;
  permissions?: { push?: boolean };
}

interface RawBranch {
  name: string;
  commit: { sha: string };
}

interface RawContent {
  path: string;
  content: string;
  encoding: string;
  sha: string;
}

interface RawPull {
  number: number;
  html_url: string;
  state: "open" | "closed";
  merged: boolean;
  mergeable: boolean | null;
  head: { sha: string; ref: string };
  base: { ref: string };
}

interface RawStatus {
  state: string;
  context: string;
  target_url: string | null;
}

interface RawCheckRun {
  name: string;
  status: string;
  conclusion: string | null;
  details_url: string | null;
}

export class GitHubClient {
  private readonly auth: GitHubAuthStrategy;
  private readonly baseUrl: string;

  constructor(auth: GitHubAuthStrategy, opts: { baseUrl?: string } = {}) {
    this.auth = auth;
    this.baseUrl = (opts.baseUrl ?? "https://api.github.com").replace(/\/+$/, "");
  }

  private async request(path: string, init: { method?: string; body?: unknown; query?: Record<string, string | number | undefined> } = {}): Promise<{ status: number; body: unknown; headers: Headers }> {
    const query = init.query
      ? "?" +
        Object.entries(init.query)
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
          .join("&")
      : "";
    const url = `${this.baseUrl}${path}${query}`;
    const authHeader = await this.auth.getAuthHeader();

    let response: Response;
    try {
      response = await fetch(url, {
        method: init.method ?? "GET",
        headers: {
          Authorization: authHeader,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
        signal: AbortSignal.timeout(GITHUB_REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      // Network error / timeout — never reached GitHub, so there's no
      // Authorization header anywhere near this message.
      throw mapGitHubError(null, error instanceof Error ? error.message : String(error), false);
    }

    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }

    if (!response.ok) {
      const detail = (body as { message?: string } | null)?.message;
      const rateLimited = response.headers.get("x-ratelimit-remaining") === "0" || /rate limit/i.test(detail ?? "");
      throw mapGitHubError(response.status, detail, rateLimited);
    }
    return { status: response.status, body, headers: response.headers };
  }

  async getAuthenticatedUser(): Promise<{ login: string }> {
    const { body } = await this.request("/user");
    return { login: (body as { login: string }).login };
  }

  /** Repository discovery (spec: "list accessible repositories" rather than
   * requiring a manually-typed URL) — one page, capped at
   * GITHUB_REPO_LIST_PER_PAGE, sorted by most-recently-pushed so the
   * repository the admin is looking for is likely near the top. */
  async listRepositories(): Promise<GitHubRepoSummary[]> {
    const { body } = await this.request("/user/repos", { query: { per_page: GITHUB_REPO_LIST_PER_PAGE, sort: "pushed", affiliation: "owner,collaborator,organization_member" } });
    const repos = body as RawRepo[];
    return repos.map((r) => ({ owner: r.owner.login, name: r.name, fullName: r.full_name, defaultBranch: r.default_branch, private: r.private, htmlUrl: r.html_url }));
  }

  async getRepository(owner: string, repo: string): Promise<GitHubRepoSummary | null> {
    try {
      const { body } = await this.request(`/repos/${owner}/${repo}`);
      const r = body as RawRepo;
      return { owner: r.owner.login, name: r.name, fullName: r.full_name, defaultBranch: r.default_branch, private: r.private, htmlUrl: r.html_url };
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async getBranch(owner: string, repo: string, branch: string): Promise<{ sha: string } | null> {
    try {
      const { body } = await this.request(`/repos/${owner}/${repo}/branches/${encodeURIComponent(branch)}`);
      return { sha: (body as RawBranch).commit.sha };
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  /** Creates a branch pointing at `fromSha`. Throws (not swallowed) if the
   * branch already exists — see lib/publishing/github/errors.ts's
   * isAlreadyExistsError and lib/publishing/github/retry-strategy.ts for the
   * "check first, don't blindly retry" decision that wraps this call. */
  async createBranch(owner: string, repo: string, branchName: string, fromSha: string): Promise<void> {
    await this.request(`/repos/${owner}/${repo}/git/refs`, { method: "POST", body: { ref: `refs/heads/${branchName}`, sha: fromSha } });
  }

  /** Reads a file's current content + blob sha (needed to update it without
   * a 409/422 "sha mismatch") — null if the file doesn't exist at this ref
   * yet (a genuinely new file, not an error). */
  async getFileContent(owner: string, repo: string, path: string, ref: string): Promise<GitHubFileContent | null> {
    try {
      const { body } = await this.request(`/repos/${owner}/${repo}/contents/${encodePathSegments(path)}`, { query: { ref } });
      const raw = body as RawContent;
      if (Array.isArray(body)) throw new Error(`Path "${path}" is a directory, not a file`);
      const decoded = raw.encoding === "base64" ? Buffer.from(raw.content, "base64").toString("utf8") : raw.content;
      return { path: raw.path, content: decoded, sha: raw.sha };
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  /** Creates or updates one file on `branch` in a single commit. `sha` must
   * be the file's current blob sha when updating an existing file (from
   * getFileContent) — omitted for a brand-new file. */
  async putFileContents(owner: string, repo: string, path: string, input: { message: string; content: string; branch: string; sha?: string }): Promise<{ commitSha: string }> {
    const { body } = await this.request(`/repos/${owner}/${repo}/contents/${encodePathSegments(path)}`, {
      method: "PUT",
      body: {
        message: input.message,
        content: Buffer.from(input.content, "utf8").toString("base64"),
        branch: input.branch,
        ...(input.sha ? { sha: input.sha } : {}),
      },
    });
    const commitSha = (body as { commit?: { sha?: string } }).commit?.sha;
    if (!commitSha) throw new Error(`GitHub did not return a commit sha for ${path}`);
    return { commitSha };
  }

  /** Existing open PRs whose head is exactly `branch` — the idempotency
   * check before ever creating a new PR (spec: "check branch, check commit,
   * check PR" before retrying). */
  async findPullRequestsForBranch(owner: string, repo: string, branch: string, state: "open" | "closed" | "all" = "open"): Promise<GitHubPullRequestSummary[]> {
    const { body } = await this.request(`/repos/${owner}/${repo}/pulls`, { query: { head: `${owner}:${branch}`, state, per_page: GITHUB_PR_LOOKUP_PER_PAGE } });
    return (body as RawPull[]).map(mapPull);
  }

  async createPullRequest(owner: string, repo: string, input: { title: string; head: string; base: string; body: string }): Promise<GitHubPullRequestSummary> {
    const { body } = await this.request(`/repos/${owner}/${repo}/pulls`, { method: "POST", body: input });
    return mapPull(body as RawPull);
  }

  async getPullRequest(owner: string, repo: string, number: number): Promise<GitHubPullRequestSummary | null> {
    try {
      const { body } = await this.request(`/repos/${owner}/${repo}/pulls/${number}`);
      return mapPull(body as RawPull);
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  /** Merges an open PR into its base branch. `mergeMethod` defaults to
   * "squash" — one clean commit on the production branch per publication,
   * consistent regardless of how many intermediate commits the platform (or
   * a human reviewer) pushed to the working branch. */
  async mergePullRequest(owner: string, repo: string, number: number, input: { commitTitle: string; mergeMethod?: "merge" | "squash" | "rebase" }): Promise<GitHubMergeResult> {
    const { body } = await this.request(`/repos/${owner}/${repo}/pulls/${number}/merge`, {
      method: "PUT",
      body: { commit_title: input.commitTitle, merge_method: input.mergeMethod ?? "squash" },
    });
    const result = body as { merged: boolean; sha: string; message: string };
    return { merged: result.merged, sha: result.sha ?? null, message: result.message };
  }

  /**
   * Best-effort deployment-status detection using GitHub's own commit
   * Statuses + Checks APIs — never a call to the Vercel API. Vercel's
   * GitHub integration posts either a legacy commit status (context
   * containing "vercel") or a Check Run (name containing "Vercel") with a
   * `target_url`/`details_url` pointing at the preview deployment; this
   * reads whichever is present. Returns nulls (not an error) when neither
   * exists yet — a genuinely common, non-error state right after a commit.
   */
  async getDeploymentSignal(owner: string, repo: string, sha: string): Promise<GitHubDeploymentSignal> {
    const [statusResult, checksResult] = await Promise.all([
      this.request(`/repos/${owner}/${repo}/commits/${sha}/status`).catch(() => null),
      this.request(`/repos/${owner}/${repo}/commits/${sha}/check-runs`).catch(() => null),
    ]);

    let combinedState: string | null = null;
    let vercelPreviewUrl: string | null = null;
    let vercelState: string | null = null;

    if (statusResult) {
      const body = statusResult.body as { state: string; statuses: RawStatus[] };
      combinedState = body.state ?? null;
      const vercelStatus = body.statuses?.find((s) => /vercel/i.test(s.context));
      if (vercelStatus) {
        vercelPreviewUrl = vercelStatus.target_url;
        vercelState = vercelStatus.state;
      }
    }

    if (!vercelPreviewUrl && checksResult) {
      const body = checksResult.body as { check_runs: RawCheckRun[] };
      const vercelCheck = body.check_runs?.find((c) => /vercel/i.test(c.name));
      if (vercelCheck) {
        vercelPreviewUrl = vercelCheck.details_url;
        vercelState = vercelCheck.conclusion ?? vercelCheck.status;
      }
    }

    return { combinedState, vercelPreviewUrl, vercelState };
  }
}

function mapPull(raw: RawPull): GitHubPullRequestSummary {
  return {
    number: raw.number,
    htmlUrl: raw.html_url,
    state: raw.state,
    merged: raw.merged,
    mergeable: raw.mergeable,
    headSha: raw.head.sha,
    headRef: raw.head.ref,
    baseRef: raw.base.ref,
  };
}

function isNotFound(error: unknown): boolean {
  return error instanceof Error && error.name === "GitHubApiError" && (error as { kind?: string }).kind === "NOT_FOUND";
}

/** Path segments must be individually percent-encoded (not the slashes
 * between them) for the GitHub Contents API. */
function encodePathSegments(path: string): string {
  return path
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}
