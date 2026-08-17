-- Phase 6A: GitHub/Vercel Publishing Provider.
-- One new job type: MERGE_TO_PRODUCTION -- the explicit, human-triggered
-- action that merges an already-open pull request into the production
-- branch. Deliberately NOT a reuse of PUBLISH_CONTENT (WordPress's "flip
-- draft to published" job, unchanged by this phase) -- for a GitHub
-- connection in the default GITHUB_PULL_REQUEST mode, nothing should go
-- live until this distinct, separately-audited operation runs. Kept in its
-- own migration/transaction, same reasoning as every prior job_type
-- addition (0005/0007/0009/0012/0015/0017/0020).

alter type job_type add value 'MERGE_TO_PRODUCTION';
