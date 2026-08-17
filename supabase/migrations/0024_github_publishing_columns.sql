-- Phase 6A: GitHub/Vercel Publishing Provider -- table/column changes.
-- Separate migration from 0023's enum-value additions (same "don't use a
-- freshly-added enum value in the same transaction it was added in"
-- reasoning as every prior phase, even though none of the statements below
-- actually reference a bare 'github'/'pending_repo_selection' literal --
-- kept split for consistency and to be safe rather than clever).

-- ---------------------------------------------------------------------------
-- cms_connections: base_url/username are WordPress-specific (a GitHub
-- connection has neither a "site URL" nor a login username in the same
-- sense) -- made nullable rather than storing an empty-string placeholder.
-- New columns are additive; credential_secret_id is REUSED as-is for the
-- GitHub token (same Vault-backed cms_credential_* RPCs Phase 5 built --
-- "extend the existing CMS/publishing connection architecture rather than
-- creating an unrelated system", per spec).
-- ---------------------------------------------------------------------------

alter table cms_connections
  alter column base_url drop not null,
  alter column username drop not null,
  add column github_owner text,
  add column github_repo text,
  add column github_production_branch text,
  -- The authenticated identity the token belongs to (a user or org login) --
  -- "installation/account identity" from the spec's connection-model list.
  -- Not a GitHub App installation id (no App in this phase -- see README).
  add column github_account_login text,
  add column github_publication_mode github_publication_mode not null default 'GITHUB_PULL_REQUEST',
  -- Optional: only populated if/when a VercelDeploymentProvider is actually
  -- wired up (spec: "do not store redundant Vercel credentials if Vercel
  -- does not need to be called directly" -- this is a plain project
  -- identifier, not a credential, and stays null until that's built).
  add column vercel_project_id text;

-- ---------------------------------------------------------------------------
-- content_publications: git-flow identifiers, additive, all nullable (a
-- WordPress-provider row never populates any of these). Reuses the existing
-- one-row-per-lineage/updated-in-place pattern Phase 5 established --
-- base_commit_sha/commit_sha/production_commit_sha together are exactly
-- "preserve previous commit SHA, new commit SHA" from the spec's Rollback
-- Safety section, letting a future rollback system use real Git history
-- without this phase building one.
-- ---------------------------------------------------------------------------

alter table content_publications
  add column branch_name text,
  -- Production branch's HEAD commit SHA at the moment we branched off --
  -- the pre-change baseline a future rollback would revert to.
  add column base_commit_sha text,
  -- Latest commit SHA on our working branch (updated on every re-commit).
  add column commit_sha text,
  add column pull_request_number integer,
  add column pull_request_url text,
  -- Vercel preview URL for the open PR, when detected (spec: "detect/record
  -- Vercel preview if available" -- best-effort, never required).
  add column preview_url text,
  -- Set once MERGE_TO_PRODUCTION actually merges -- the production branch's
  -- new HEAD SHA, distinct from commit_sha if the PR was updated after the
  -- merge decision was made.
  add column production_commit_sha text;
