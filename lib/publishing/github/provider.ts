import { GitHubClient } from "@/lib/publishing/github/client";
import { computeBranchName, decideBranchAction, decidePullRequestAction, decideMergeAction } from "@/lib/publishing/github/retry-strategy";
import { isAlreadyExistsError } from "@/lib/publishing/github/errors";
import type { GitHubAuthStrategy } from "@/lib/publishing/github/auth";
import type { WebsiteContentAdapter, AdapterPageInput } from "@/lib/publishing/github/content-adapter";
import type { ConnectionTestResult, PublishedPageResult, PublishingProvider, PublishPageInput, PublicationStatusResult } from "@/lib/publishing/provider";
import type { GithubPublicationMode } from "@/lib/supabase/types";

export interface GitHubProviderConfig {
  auth: GitHubAuthStrategy;
  owner: string;
  repo: string;
  productionBranch: string;
  publicationMode: GithubPublicationMode;
  contentAdapter: WebsiteContentAdapter;
}

/** Everything about a git-based publication that doesn't fit
 * PublishedPageResult's flat WordPress-shaped fields — stored verbatim in
 * `raw` (already documented as "safe to store, never credentials") and
 * mapped by the job handler onto content_publications' dedicated
 * branch_name/commit_sha/pull_request_number/preview_url columns. */
export interface GitHubPublicationRaw {
  branchName: string;
  baseCommitSha: string;
  commitSha: string;
  pullRequestNumber: number | null;
  pullRequestUrl: string | null;
  previewUrl: string | null;
  merged: boolean;
  productionCommitSha: string | null;
}

/**
 * Implements the same PublishingProvider interface WordPress does, so the
 * factory (lib/publishing/get-provider.ts) stays uniform — but the *meaning*
 * of createDraft/publish differs, by design, to match a git-based site's
 * real workflow (spec: "map these operations onto branch creation, file
 * creation, commit, pull request, merge"):
 *
 *   createDraft(input) -> branch + commit + pull request. Never live —
 *     exactly the same guarantee WordPress's createDraft makes, just
 *     implemented as "a PR isn't merged" instead of "a page's status isn't
 *     'publish'".
 *   update(externalId, input) -> re-commits new file changes to the same
 *     already-open PR's branch (a revision before merge, or a follow-up
 *     change).
 *   publish(input, existingExternalId) -> merges the PR into the production
 *     branch. Requires an already-open PR (existingExternalId = the PR
 *     number) — there is no path where publish() creates a PR AND merges it
 *     in one call, so a caller can never accidentally skip the PR/preview
 *     step. Reserved for lib/jobs/handlers/merge-to-production.ts, never
 *     called from create-draft.ts's GitHub branch.
 *
 * `externalId` throughout is the pull request number, stringified — the
 * closest GitHub concept to WordPress's page id as "the opaque identifier
 * that lets us find this exact publication again."
 */
export class GitHubPublishingProvider implements PublishingProvider {
  readonly name = "github";
  private readonly client: GitHubClient;
  private readonly owner: string;
  private readonly repo: string;
  private readonly productionBranch: string;
  private readonly publicationMode: GithubPublicationMode;
  private readonly contentAdapter: WebsiteContentAdapter;

  constructor(config: GitHubProviderConfig) {
    this.client = new GitHubClient(config.auth);
    this.owner = config.owner;
    this.repo = config.repo;
    this.productionBranch = config.productionBranch;
    this.publicationMode = config.publicationMode;
    this.contentAdapter = config.contentAdapter;
  }

  async testConnection(): Promise<ConnectionTestResult> {
    try {
      const user = await this.client.getAuthenticatedUser();
      const repo = await this.client.getRepository(this.owner, this.repo);
      if (!repo) return { ok: false, message: `Repository ${this.owner}/${this.repo} was not found, or ${user.login}'s token cannot access it.` };
      const branch = await this.client.getBranch(this.owner, this.repo, this.productionBranch);
      if (!branch) return { ok: false, message: `Production branch "${this.productionBranch}" was not found on ${repo.fullName}.` };
      return { ok: true, message: `Connected as ${user.login} — ${repo.fullName} (production branch: ${this.productionBranch}) is accessible.` };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "Could not connect to GitHub." };
    }
  }

  /** Branch + commit + pull request — never merges, never goes live.
   * Idempotent across retries: reuses an already-known branch/PR from a
   * prior attempt (input.git.knownBranchName/knownPullRequestNumber) before
   * ever creating anything new, and checks live GitHub state before
   * creating even when nothing is known locally (spec: "before retrying:
   * check branch, check commit, check PR"). */
  async createDraft(input: PublishPageInput): Promise<PublishedPageResult> {
    const git = requireGitInput(input);
    // git.knownBranchName (from content_publications.branch_name, if a
    // prior attempt already recorded one) is what makes this idempotent on
    // retry WITHOUT the caller needing to know a PR number yet — prepare()
    // still independently discovers/reuses an existing PR for that branch
    // even when none is passed here.
    return this.prepare(git, git.knownBranchName, null);
  }

  /** Re-commits new file changes to the same PR's branch — used for a
   * follow-up revision before merge. `externalId` (the PR number) must
   * already exist. */
  async update(externalId: string, input: PublishPageInput): Promise<PublishedPageResult> {
    const git = requireGitInput(input);
    const prNumber = Number(externalId);
    if (!Number.isFinite(prNumber)) throw new Error(`GitHubPublishingProvider.update: "${externalId}" is not a valid pull request number.`);
    return this.prepare(git, git.knownBranchName, prNumber);
  }

  /** Merges the pull request into the production branch. Requires an
   * already-open PR — `existingExternalId` is mandatory here (unlike
   * WordPress, where publish() can create-and-publish in one call). There is
   * deliberately no "create a PR and merge it in the same call" path. */
  async publish(_input: PublishPageInput, existingExternalId?: string | null): Promise<PublishedPageResult> {
    if (!existingExternalId) {
      throw new Error("GitHubPublishingProvider.publish requires an existing pull request — call createDraft first, then merge only after human review of the preview.");
    }
    return this.merge(Number(existingExternalId));
  }

  async getPublishedPage(externalId: string): Promise<PublishedPageResult | null> {
    const prNumber = Number(externalId);
    if (!Number.isFinite(prNumber)) return null;
    const pr = await this.client.getPullRequest(this.owner, this.repo, prNumber);
    if (!pr) return null;
    return {
      externalId: String(pr.number),
      url: pr.htmlUrl,
      status: pr.merged ? "publish" : "draft",
      raw: { branchName: pr.headRef, commitSha: pr.headSha, pullRequestNumber: pr.number, pullRequestUrl: pr.htmlUrl, merged: pr.merged } satisfies Partial<GitHubPublicationRaw>,
    };
  }

  /**
   * Not implemented for GitHub: production-URL collision detection at the
   * provider level is intentionally left to the content adapter's own
   * CREATE_NEW_PAGE guard (lib/publishing/github/markdown-adapter.ts throws
   * ContentAdapterError when a file already sits at the computed path) —
   * that repo-file-level check is the real collision guard for a git-based
   * site, more precise than a synthetic slug lookup would be. The actual
   * "was OUR OWN branch/PR already created" idempotency (the spec's stated
   * concern) is handled by decideBranchAction/decidePullRequestAction
   * inside createDraft/update, not through this method.
   */
  async findBySlug(): Promise<PublishedPageResult | null> {
    return null;
  }

  /** Not supported in this phase — "do not build automatic rollback" (spec).
   * A GitHub-based publication's history lives in Git itself; a future
   * rollback system reverts via a new PR, it does not call this. */
  async unpublish(): Promise<PublishedPageResult> {
    throw new Error("Unpublishing a GitHub-based publication is not supported in this phase — revert the merge commit via a new pull request instead (Git history is preserved for exactly this).");
  }

  /** Optional PublishingProvider extension (spec: getPublicationStatus()) —
   * WordPress doesn't implement this; GitHub's multi-stage flow is exactly
   * why it exists. Combines the PR's own state with a best-effort
   * deployment signal (lib/publishing/github/client.ts's getDeploymentSignal
   * — GitHub Statuses/Checks only, never a Vercel API call). */
  async getPublicationStatus(externalId: string): Promise<PublicationStatusResult | null> {
    const prNumber = Number(externalId);
    if (!Number.isFinite(prNumber)) return null;
    const pr = await this.client.getPullRequest(this.owner, this.repo, prNumber);
    if (!pr) return null;
    const deployment = await this.client.getDeploymentSignal(this.owner, this.repo, pr.headSha).catch(() => ({ combinedState: null, vercelPreviewUrl: null, vercelState: null }));
    return {
      merged: pr.merged,
      previewUrl: deployment.vercelPreviewUrl,
      deploymentState: deployment.vercelState ?? deployment.combinedState,
    };
  }

  // ---------------------------------------------------------------------------
  // Internal: the actual branch/commit/PR orchestration, shared by
  // createDraft/update.
  // ---------------------------------------------------------------------------

  private async prepare(git: RequiredGitInput, knownBranchName: string | null, knownPullRequestNumber: number | null): Promise<PublishedPageResult> {
    const candidateBranchName = knownBranchName ?? computeBranchName(git.contentVersionId);

    // --- Branch: reuse known, adopt existing, or create new ---
    const productionRef = await this.client.getBranch(this.owner, this.repo, this.productionBranch);
    if (!productionRef) throw new Error(`Production branch "${this.productionBranch}" not found on ${this.owner}/${this.repo}.`);

    const existingBranch = await this.client.getBranch(this.owner, this.repo, candidateBranchName);
    const branchAction = decideBranchAction({ knownBranchName, branchExistsOnGitHub: existingBranch !== null });
    let baseCommitSha: string;
    if (branchAction === "CREATE_NEW") {
      try {
        await this.client.createBranch(this.owner, this.repo, candidateBranchName, productionRef.sha);
      } catch (error) {
        if (!isAlreadyExistsError(error)) throw error;
        // Lost a race with a concurrent attempt (or our own prior try that
        // this process didn't record) — fall through and use it, never fail.
      }
      baseCommitSha = productionRef.sha;
    } else {
      baseCommitSha = existingBranch?.sha ?? productionRef.sha;
    }

    // --- Adapter: plan + validate file changes against the branch's current content ---
    const filesToRead = this.contentAdapter.filePathsToRead(git.adapterInput);
    const existingFiles = new Map<string, { content: string; sha: string }>();
    for (const path of filesToRead) {
      const file = await this.client.getFileContent(this.owner, this.repo, path, candidateBranchName);
      if (file) existingFiles.set(path, { content: file.content, sha: file.sha });
    }
    const plan = this.contentAdapter.planFileChanges(git.adapterInput, existingFiles);
    for (const change of plan.files) {
      const validation = this.contentAdapter.validateFileChange(change);
      if (!validation.valid) throw new Error(`Generated file "${change.path}" failed validation: ${validation.errors.join("; ")}`);
    }

    // --- Commit every planned file to the branch ---
    let latestCommitSha = baseCommitSha;
    for (const change of plan.files) {
      const existing = existingFiles.get(change.path);
      const { commitSha } = await this.client.putFileContents(this.owner, this.repo, change.path, {
        message: git.commitMessage,
        content: change.content,
        branch: candidateBranchName,
        sha: existing?.sha,
      });
      latestCommitSha = commitSha;
    }

    // --- Pull request: reuse known, adopt existing, or create new ---
    let pullRequestNumber = knownPullRequestNumber;
    let pullRequestUrl: string | null = null;
    if (this.publicationMode !== "GITHUB_BRANCH_ONLY") {
      const existingPrs = pullRequestNumber ? [] : await this.client.findPullRequestsForBranch(this.owner, this.repo, candidateBranchName, "open");
      const prAction = decidePullRequestAction({ knownPullRequestNumber: pullRequestNumber, existingPullRequestForBranch: existingPrs[0] ?? null });
      if (prAction === "CREATE_NEW") {
        const created = await this.client.createPullRequest(this.owner, this.repo, {
          title: git.pullRequestTitle,
          head: candidateBranchName,
          base: this.productionBranch,
          body: git.pullRequestBody,
        });
        pullRequestNumber = created.number;
        pullRequestUrl = created.htmlUrl;
      } else {
        const number = prAction === "ADOPT_EXISTING" ? existingPrs[0]!.number : pullRequestNumber!;
        const pr = await this.client.getPullRequest(this.owner, this.repo, number);
        pullRequestNumber = number;
        pullRequestUrl = pr?.htmlUrl ?? null;
      }
    }

    const deployment = await this.client.getDeploymentSignal(this.owner, this.repo, latestCommitSha).catch(() => ({ vercelPreviewUrl: null }));

    const raw: GitHubPublicationRaw = {
      branchName: candidateBranchName,
      baseCommitSha,
      commitSha: latestCommitSha,
      pullRequestNumber,
      pullRequestUrl,
      previewUrl: deployment.vercelPreviewUrl,
      merged: false,
      productionCommitSha: null,
    };

    return {
      externalId: pullRequestNumber ? String(pullRequestNumber) : candidateBranchName,
      url: pullRequestUrl ?? deployment.vercelPreviewUrl ?? "",
      status: "draft",
      raw: raw as unknown as Record<string, unknown>,
    };
  }

  private async merge(prNumber: number): Promise<PublishedPageResult> {
    const pr = await this.client.getPullRequest(this.owner, this.repo, prNumber);
    if (!pr) throw new Error(`Pull request #${prNumber} not found on ${this.owner}/${this.repo}.`);

    const action = decideMergeAction({ pullRequestMerged: pr.merged, pullRequestState: pr.state, mergeable: pr.mergeable });
    if (action === "ALREADY_MERGED") {
      return {
        externalId: String(pr.number),
        url: pr.htmlUrl,
        status: "publish",
        raw: { branchName: pr.headRef, pullRequestNumber: pr.number, pullRequestUrl: pr.htmlUrl, merged: true } satisfies Partial<GitHubPublicationRaw>,
      };
    }
    if (action === "BLOCKED") {
      throw new Error(`Pull request #${prNumber} cannot be merged automatically (closed without merging, or has conflicts) — resolve this on GitHub, then retry.`);
    }
    if (action === "NOT_YET_MERGEABLE") {
      throw new Error(`GitHub has not finished computing whether pull request #${prNumber} is mergeable yet — try again shortly.`);
    }

    const result = await this.client.mergePullRequest(this.owner, this.repo, prNumber, { commitTitle: `Merge pull request #${prNumber}` });
    if (!result.merged) throw new Error(`GitHub declined to merge pull request #${prNumber}: ${result.message}`);

    return {
      externalId: String(pr.number),
      url: pr.htmlUrl,
      status: "publish",
      raw: {
        branchName: pr.headRef,
        pullRequestNumber: pr.number,
        pullRequestUrl: pr.htmlUrl,
        merged: true,
        productionCommitSha: result.sha,
      } satisfies Partial<GitHubPublicationRaw>,
    };
  }
}

interface RequiredGitInput {
  contentVersionId: string;
  adapterInput: AdapterPageInput;
  commitMessage: string;
  pullRequestTitle: string;
  pullRequestBody: string;
  knownBranchName: string | null;
}

function requireGitInput(input: PublishPageInput): RequiredGitInput {
  if (!input.git) {
    throw new Error("GitHubPublishingProvider requires PublishPageInput.git (structured content for a WebsiteContentAdapter) — a flat bodyHtml alone isn't enough for a git-based site.");
  }
  return {
    contentVersionId: input.git.contentVersionId,
    adapterInput: {
      contentType: input.git.contentType,
      targetUrl: input.git.targetUrl,
      slug: input.slug,
      title: input.title,
      bodyMarkdown: input.git.bodyMarkdown,
      metaDescription: input.excerpt,
      h1: input.git.h1,
    },
    commitMessage: `${input.git.contentType === "CREATE_NEW_PAGE" ? "Add" : "Update"} page: ${input.title}`,
    pullRequestTitle: `SEO: ${input.title}`,
    pullRequestBody: input.git.pullRequestBody ?? `Automated SEO ${input.git.contentType === "CREATE_NEW_PAGE" ? "page creation" : "page update"} for "${input.title}" (${input.slug}).\n\nGenerated and approved through the SEO platform's content pipeline — see the linked content brief for full context.`,
    knownBranchName: input.git.knownBranchName ?? null,
  };
}
