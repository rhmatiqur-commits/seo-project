-- Phase 7.2I follow-up: a per-website URL path prefix that brief generation
-- consults when suggesting a URL for a brand-new page.
--
-- lib/content/build-brief.ts's suggestUrlSlug() is deliberately generic —
-- it has no idea any particular website places new pages under a
-- subdirectory (e.g. CV Central's real site only ever creates new pages at
-- blog/<slug>.html, per lib/publishing/github/cvcentral-adapter.ts, built
-- from directly inspecting that repo). Without this column, every
-- CREATE_NEW_PAGE brief for such a site recommends a URL that doesn't match
-- where the content adapter will actually place the file — exactly the
-- mismatch discovered and hand-corrected for CV Central's first real
-- published page (content_briefs/content_publications/seo_actions rows for
-- "international-cv-guide"). NULL (the default) means "no known prefix,
-- keep suggesting a bare slug at the site root" — never invented, same
-- "don't guess" convention every other content-profile field on this table
-- already follows (business_description, target_audience, etc.).
alter table websites
  add column content_path_prefix text null;

comment on column websites.content_path_prefix is
  'Optional path segment (e.g. "blog") new-page URL suggestions are placed under. NULL = suggest a bare slug at the site root.';
