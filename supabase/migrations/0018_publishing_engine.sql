-- Phase 5: Publishing Engine.
-- Turns APPROVED content (Phase 4's terminal content_jobs.status) into a
-- real page on the client's WordPress site via an explicit human action
-- (Create Draft / Publish), never automatically. content_jobs' own status
-- machine is untouched -- publication status is its own dimension here.

-- ---------------------------------------------------------------------------
-- Credential storage: Supabase Vault (already installed on this project --
-- see `vault` schema / pgsodium) rather than a plaintext column or a
-- hand-rolled app-layer encryption key. Vault isn't exposed via PostgREST,
-- so these four SECURITY DEFINER wrappers bridge the app's existing
-- service-role client to it. Granted to service_role only below -- the
-- secret value never appears in any `select *` on cms_connections, and is
-- only ever decrypted server-side, in-process, right before a WordPress API
-- call (see lib/publishing/wordpress-provider.ts).
-- ---------------------------------------------------------------------------

create or replace function public.cms_credential_create(p_secret text, p_description text default null)
returns uuid
language plpgsql
security definer
set search_path = vault, public
as $$
declare
  v_id uuid;
begin
  v_id := vault.create_secret(p_secret, null, p_description);
  return v_id;
end;
$$;

create or replace function public.cms_credential_read(p_id uuid)
returns text
language plpgsql
security definer
set search_path = vault, public
as $$
declare
  v_secret text;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where id = p_id;
  return v_secret;
end;
$$;

create or replace function public.cms_credential_update(p_id uuid, p_secret text)
returns void
language plpgsql
security definer
set search_path = vault, public
as $$
begin
  perform vault.update_secret(p_id, p_secret);
end;
$$;

create or replace function public.cms_credential_delete(p_id uuid)
returns void
language plpgsql
security definer
set search_path = vault, public
as $$
begin
  delete from vault.secrets where id = p_id;
end;
$$;

revoke all on function public.cms_credential_create(text, text) from public, anon, authenticated;
revoke all on function public.cms_credential_read(uuid) from public, anon, authenticated;
revoke all on function public.cms_credential_update(uuid, text) from public, anon, authenticated;
revoke all on function public.cms_credential_delete(uuid) from public, anon, authenticated;
grant execute on function public.cms_credential_create(text, text) to service_role;
grant execute on function public.cms_credential_read(uuid) to service_role;
grant execute on function public.cms_credential_update(uuid, text) to service_role;
grant execute on function public.cms_credential_delete(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- cms_connections -- one per website (unique), mirrors search_console_connections.
-- ---------------------------------------------------------------------------

create type cms_provider as enum ('wordpress');
create type cms_connection_status as enum ('pending', 'active', 'error');

create table cms_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  website_id uuid not null references websites (id) on delete cascade,
  provider cms_provider not null default 'wordpress',
  base_url text not null,
  username text not null,
  -- Logically references vault.secrets.id (no literal cross-schema FK --
  -- vault is a Supabase-managed schema). Access only via the four functions
  -- above, from lib/db/cms-connections.ts.
  credential_secret_id uuid not null,
  status cms_connection_status not null default 'pending',
  last_tested_at timestamptz,
  last_test_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (website_id)
);

create trigger cms_connections_set_updated_at before update on cms_connections
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- content_publications -- one row per publication lineage (updated in place
-- across retries, not re-inserted -- this is what makes external_id learned
-- on attempt 1 visible to attempt 2's duplicate-prevention check).
-- ---------------------------------------------------------------------------

create type publication_status as enum ('PENDING', 'PUBLISHING', 'DRAFTED', 'PUBLISHED', 'FAILED', 'UNPUBLISHED');

create table content_publications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  website_id uuid not null references websites (id) on delete cascade,
  content_version_id uuid not null references content_versions (id) on delete cascade,
  provider cms_provider not null default 'wordpress',
  publication_type opportunity_type not null, -- reused enum; only CREATE_NEW_PAGE/OPTIMISE_EXISTING_PAGE rows are ever inserted
  external_id text,
  target_url text,
  status publication_status not null default 'PENDING',
  published_at timestamptz,
  error text,
  provider_response_metadata jsonb not null default '{}'::jsonb, -- non-sensitive fields only, never raw credentials
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger content_publications_set_updated_at before update on content_publications
  for each row execute function set_updated_at();

create index content_publications_content_version_id_idx on content_publications (content_version_id);
create index content_publications_website_status_idx on content_publications (website_id, status);

-- ---------------------------------------------------------------------------
-- publication_audit_log -- who approved / who initiated / what happened.
-- `actor` is a constant placeholder today (no per-user auth system exists
-- yet -- see SECURITY_AUDIT.md's documented, deferred limitation); ready for
-- real per-user identity once that exists, not fabricated now.
-- ---------------------------------------------------------------------------

create table publication_audit_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  website_id uuid not null references websites (id) on delete cascade,
  content_publication_id uuid references content_publications (id) on delete set null,
  content_version_id uuid not null references content_versions (id) on delete cascade,
  action text not null,
  actor text not null default 'admin',
  target_url text,
  result text,
  failure_reason text,
  created_at timestamptz not null default now()
);

create index publication_audit_log_content_version_id_idx on publication_audit_log (content_version_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table cms_connections enable row level security;
alter table content_publications enable row level security;
alter table publication_audit_log enable row level security;

create policy cms_connections_member_all on cms_connections
  for all using (is_org_member(organization_id)) with check (is_org_member(organization_id));

create policy content_publications_member_all on content_publications
  for all using (is_org_member(organization_id)) with check (is_org_member(organization_id));

create policy publication_audit_log_member_all on publication_audit_log
  for all using (is_org_member(organization_id)) with check (is_org_member(organization_id));
