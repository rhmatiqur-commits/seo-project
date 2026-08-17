-- Phase 6A (CV Central follow-up): explicit per-connection content-adapter
-- selection, rather than special-casing a known owner/repo inside
-- lib/publishing/get-provider.ts. Keeps "which WebsiteContentAdapter to use"
-- at the configuration layer -- same reasoning AI_PROVIDER/CONTENT_PROVIDER
-- already establish elsewhere in this codebase -- so
-- GitHubPublishingProvider itself never hard-codes CV Central specifics.
--
-- 'configurable_markdown' (default) is the generic Markdown+frontmatter
-- adapter every other GitHub-connected site uses out of the box.
-- 'cvcentral' is the real adapter built from inspecting the actual
-- rhmatiqur-commits/cvcentral repository (static HTML, no build step,
-- inline nav/footer per file) -- see lib/publishing/github/cvcentral-adapter.ts.

create type github_content_adapter as enum ('configurable_markdown', 'cvcentral');

alter table cms_connections
  add column content_adapter github_content_adapter not null default 'configurable_markdown';
