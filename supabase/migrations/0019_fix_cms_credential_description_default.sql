-- Fix found immediately after 0018: vault.secrets.description is NOT NULL on
-- this project (confirmed live, not documented in Supabase's own docs) --
-- omitting the optional p_description argument to cms_credential_create
-- passed NULL through to vault.create_secret() and violated that
-- constraint. Same "found necessary during live testing" pattern as 0003.

create or replace function public.cms_credential_create(p_secret text, p_description text default '')
returns uuid
language plpgsql
security definer
set search_path = vault, public
as $$
declare
  v_id uuid;
begin
  -- coalesce defends against a caller explicitly passing null, not just an
  -- omitted argument.
  v_id := vault.create_secret(p_secret, null, coalesce(p_description, ''));
  return v_id;
end;
$$;
