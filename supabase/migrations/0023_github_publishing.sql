-- Phase 6A: GitHub/Vercel Publishing Provider.
--
-- Extends the existing Phase 5 publishing architecture (cms_connections /
-- content_publications / publication_audit_log) so a code-based site
-- (GitHub -> Vercel -> production) can be published to alongside WordPress
-- -- the same tables, the same PublishingProvider abstraction, no parallel
-- system. CV Central is the first (and, for now, only) target: its actual
-- repository was not reachable from this environment when this was written
-- (no code, no credentials, no sibling repo on the machine -- verified the
-- same way Phase 4 verified this for CV Central's content-generation
-- system), so nothing CV-Central-specific is hard-coded here. See README's
-- "GitHub/Vercel Publishing Provider" section for the configuration contract
-- a real CV Central adapter still needs.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

alter type cms_provider add value 'github';

-- Mirrors search_console_connection_status's 'pending_site_selection' step
-- exactly: a GitHub token alone doesn't identify which repository to
-- publish to (an account can access many), so the connection starts here
-- until the admin picks one from a live-listed set (lib/publishing/github/*).
alter type cms_connection_status add value 'pending_repo_selection';

-- Spec section "PROVIDER CAPABILITIES" / "CV CENTRAL MODE": default is
-- GITHUB_PULL_REQUEST for production safety -- never merge automatically.
create type github_publication_mode as enum ('GITHUB_BRANCH_ONLY', 'GITHUB_PULL_REQUEST', 'GITHUB_MERGE');

-- Extends publication_status with the git-flow-specific intermediate states
-- (spec section "PUBLICATION STATES"). PENDING/PUBLISHED/FAILED already
-- exist and are reused as-is; DRAFTED/PUBLISHING/UNPUBLISHED remain
-- WordPress-only states, simply never used by a GitHub-provider row -- one
-- state system, not two (per spec: "do not create unnecessary duplicate
-- state systems").
alter type publication_status add value 'BRANCH_CREATED';
alter type publication_status add value 'COMMITTED';
alter type publication_status add value 'PR_CREATED';
alter type publication_status add value 'PREVIEW_READY';
alter type publication_status add value 'AWAITING_PRODUCTION_APPROVAL';
alter type publication_status add value 'MERGING';
alter type publication_status add value 'DEPLOYING';
