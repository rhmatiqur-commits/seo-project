import { WordPressPublishingProvider } from "@/lib/publishing/wordpress-provider";
import { GitHubPublishingProvider } from "@/lib/publishing/github/provider";
import { PersonalAccessTokenAuth } from "@/lib/publishing/github/auth";
import { ConfigurableMarkdownContentAdapter } from "@/lib/publishing/github/markdown-adapter";
import type { PublishingProvider } from "@/lib/publishing/provider";
import type { CmsProvider, GithubPublicationMode } from "@/lib/supabase/types";

export type PublishingConnectionConfig =
  | { provider: "wordpress"; baseUrl: string; username: string; applicationPassword: string }
  | { provider: "github"; owner: string; repo: string; productionBranch: string; publicationMode: GithubPublicationMode; token: string };

/**
 * Per-call factory, not a process-wide singleton like lib/ai/get-provider.ts
 * or lib/content/get-provider.ts — credentials are per-website, decrypted
 * fresh by the job handler right before use (see lib/db/cms-connections.ts),
 * never cached in memory across requests. `config` is a discriminated union
 * (not one flat object with optional fields) so a caller can't accidentally
 * pass a half-WordPress, half-GitHub config and have it silently ignored —
 * TypeScript forces every field the chosen provider actually needs.
 *
 * Adding Webflow/Shopify/a custom CMS later is one more union member and one
 * more switch branch here, no call-site changes beyond building that
 * member's config (same "Phase 5 architects clearly designed for this"
 * extension point, now actually exercised by Phase 6A's GitHub branch).
 */
export function createPublishingProvider(config: PublishingConnectionConfig): PublishingProvider {
  switch (config.provider) {
    case "github":
      return new GitHubPublishingProvider({
        auth: new PersonalAccessTokenAuth(config.token),
        owner: config.owner,
        repo: config.repo,
        productionBranch: config.productionBranch,
        publicationMode: config.publicationMode,
        // The only WebsiteContentAdapter implementation today — see
        // lib/publishing/github/markdown-adapter.ts's own doc comment for
        // why (CV Central's real repository structure isn't reachable from
        // this environment). Swapping in a real per-site adapter later is a
        // config/factory change here, not a GitHubPublishingProvider change.
        contentAdapter: new ConfigurableMarkdownContentAdapter(),
      });
    case "wordpress":
    default:
      return new WordPressPublishingProvider(config);
  }
}

/** Minimal shape of a cms_connections row this helper needs — structural,
 * not the full generated Row type, so it stays easy to unit-test/reuse. */
export interface CmsConnectionForProviderConfig {
  provider: CmsProvider;
  base_url: string | null;
  username: string | null;
  github_owner: string | null;
  github_repo: string | null;
  github_production_branch: string | null;
  github_publication_mode: GithubPublicationMode;
}

/**
 * Maps a cms_connections row + its already-decrypted secret onto the right
 * PublishingConnectionConfig union member — the one place this branching
 * logic lives, reused by every call site that needs a provider instance
 * (lib/jobs/handlers/publishing-shared.ts, app/admin/actions.ts's
 * testCmsConnectionAction/listGitHubRepositoriesAction) so it can't drift
 * between them. Throws a clear, permanent-shaped error if a connection is
 * missing the fields its own provider requires (e.g. a GitHub connection
 * that never finished repository selection) — never silently guesses.
 */
export function buildPublishingConnectionConfig(connection: CmsConnectionForProviderConfig, decryptedSecret: string): PublishingConnectionConfig {
  if (connection.provider === "github") {
    if (!connection.github_owner || !connection.github_repo || !connection.github_production_branch) {
      throw new Error("GitHub connection is missing a selected repository/production branch — finish repository selection before publishing.");
    }
    return {
      provider: "github",
      owner: connection.github_owner,
      repo: connection.github_repo,
      productionBranch: connection.github_production_branch,
      publicationMode: connection.github_publication_mode,
      token: decryptedSecret,
    };
  }
  if (!connection.base_url || !connection.username) {
    throw new Error("WordPress connection is missing its site URL/username — reconnect before publishing.");
  }
  return { provider: "wordpress", baseUrl: connection.base_url, username: connection.username, applicationPassword: decryptedSecret };
}
