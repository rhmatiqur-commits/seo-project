/**
 * GitHub authentication, behind an interface so a GitHub App implementation
 * can be swapped in later without touching lib/publishing/github/client.ts
 * or GitHubPublishingProvider — same "abstraction now, second
 * implementation later" pattern as AIProvider/KeywordDataProvider/
 * ContentProvider/PublishingProvider itself.
 *
 * A GitHub App (installation tokens, JWT-signed with the App's private key,
 * webhook-driven installation lifecycle) is the spec's *preferred*
 * mechanism, but is explicitly allowed to be deferred when "too large for
 * this phase" — it is: it needs App registration, a private key, an
 * installation flow, and webhook handling, none of which exist anywhere in
 * this repo yet. What ships now is a repository-scoped Personal Access
 * Token (fine-grained, ideally — scoped to exactly one repository, `Contents`
 * + `Pull requests` read/write, nothing else), stored the same way every
 * other provider's credential is: through the existing Supabase Vault
 * cms_credential_* RPCs (migration 0018), never a plaintext column, never
 * logged, never returned to the browser.
 */

export interface GitHubAuthStrategy {
  readonly kind: "personal_access_token" | "github_app";
  getAuthHeader(): Promise<string>;
}

export class PersonalAccessTokenAuth implements GitHubAuthStrategy {
  readonly kind = "personal_access_token" as const;
  private readonly token: string;

  constructor(token: string) {
    this.token = token;
  }

  async getAuthHeader(): Promise<string> {
    return `Bearer ${this.token}`;
  }
}

/**
 * Not implemented in this phase (see the file-level comment). Reserved so
 * `lib/publishing/github/get-auth.ts`'s factory has a real second branch to
 * grow into later, rather than a TODO with no shape — mirrors
 * lib/keywords/get-provider.ts's NullKeywordProvider placeholder pattern:
 * present and honest about being unimplemented, not silently absent.
 */
export class GitHubAppAuth implements GitHubAuthStrategy {
  readonly kind = "github_app" as const;

  async getAuthHeader(): Promise<string> {
    throw new Error(
      "GitHub App authentication is not implemented in this phase — connect a repository-scoped Personal Access Token instead. See README's GitHub/Vercel Publishing Provider section."
    );
  }
}
