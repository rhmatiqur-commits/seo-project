-- Phase 3D hardening: caps the blast radius of a compromised
-- BUSINESSOS_INTEGRATION_SECRET. That secret is a single global bearer
-- credential (lib/api/businessos-auth.ts) with no per-organisation scoping
-- of its own -- without this flag, a leaked secret could call
-- POST /api/businessos-integration/{verify-organization,invitations} for
-- ANY organisation id in this database, including customers who never had
-- any relationship with BusinessOS at all.
--
-- organizations.businessos_integration_enabled is an explicit,
-- default-false allowlist: both businessos-integration routes now refuse
-- to act on an organisation unless this is true, responding with the same
-- 404 "Organisation not found" as a nonexistent id either way (never a
-- distinct "forbidden" that would confirm to a prober which ids are real).
--
-- *** TRUST BOUNDARY -- READ BEFORE ADDING ANY CODE THAT TOUCHES THIS COLUMN ***
-- This flag is trusted-admin-controlled ONLY. There is deliberately no
-- application code path -- no RLS policy, no dashboard action, no admin
-- UI, no API route -- that writes to it (confirmed by grepping this
-- repository for any `.from("organizations").update(...)` before writing
-- this migration: none exist). The BusinessOS integration itself has
-- read-only reach to this column via getOrganization() and MUST NEVER be
-- given a way to set it -- that would let the very credential this column
-- exists to contain also grant itself access. For now, enabling an
-- organisation is a deliberate, manual, admin-side operation:
--
--   update public.organizations
--   set businessos_integration_enabled = true
--   where id = '<the organisation's id>';
--
-- A future phase may add an /admin UI toggle for this (still gated by the
-- existing ADMIN_PASSWORD boundary, never by the integration's own
-- credential) -- not built here, deliberately, per this hardening pass's
-- own scope.

alter table public.organizations
  add column businessos_integration_enabled boolean not null default false;

comment on column public.organizations.businessos_integration_enabled is
  'Trusted-admin-controlled allowlist for the BusinessOS integration (see /api/businessos-integration/**). Default false. No application code path writes this column -- enable manually via a direct admin-side UPDATE. Must never become writable through the BusinessOS integration API itself.';
