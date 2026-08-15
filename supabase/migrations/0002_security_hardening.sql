-- Fix advisor warnings from get_advisors after 0001_init:
-- 1) pin search_path on the trigger function (mutable search_path is a hijack vector)
-- 2) is_org_member only needs to be callable by authenticated users (used inside RLS
--    policies); anon has no legitimate reason to call it directly via PostgREST RPC.

create or replace function set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function is_org_member(uuid) from public;
revoke execute on function is_org_member(uuid) from anon;
grant execute on function is_org_member(uuid) to authenticated;
