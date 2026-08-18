-- Phase 7: Multi-Tenant Client Portal & SaaS -- invitations + role default.
-- Separate migration from 0026's enum-value additions (same "don't
-- reference a freshly-added enum value in the same transaction it was
-- added in" reasoning as every prior phase in this project).

-- Least-privilege default for any future membership row created without an
-- explicit role.
alter table memberships alter column role set default 'VIEWER';

create type invitation_status as enum ('pending', 'accepted', 'revoked', 'expired');

-- ---------------------------------------------------------------------------
-- organization_invitations -- Owner/Manager invites an email address to a
-- role; the invited user accepts via a signed token link (spec: "Never
-- allow an invited user to choose their organisation ID from the browser" --
-- acceptance is entirely server-side: the token is looked up with the
-- service-role client, the organisation/role come from the invitation row
-- itself, never from anything the browser supplies).
-- ---------------------------------------------------------------------------

create table organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  email text not null,
  role membership_role not null default 'VIEWER',
  invited_by uuid references auth.users (id) on delete set null,
  status invitation_status not null default 'pending',
  -- Unguessable acceptance token, distinct from the row's own id so the id
  -- can be used in admin-facing URLs/lists without also being a valid
  -- acceptance credential.
  token uuid not null default gen_random_uuid(),
  expires_at timestamptz not null default (now() + interval '14 days'),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  unique (token)
);

-- Prevents two simultaneous pending invitations for the same email in the
-- same organisation (re-inviting after acceptance/revocation is fine --
-- this only blocks a duplicate *pending* one).
create unique index organization_invitations_org_email_pending_uidx
  on organization_invitations (organization_id, lower(email))
  where status = 'pending';

create index organization_invitations_org_id_idx on organization_invitations (organization_id);
create index organization_invitations_email_idx on organization_invitations (lower(email));

alter table organization_invitations enable row level security;

-- Members can see their own organisation's invitations (e.g. a Settings
-- page listing "pending invites") -- same is_org_member() pattern as every
-- other tenant table. Creating/revoking an invitation and accepting one are
-- both done through server actions using the service-role client (same
-- trusted-backend pattern the rest of this app already uses for mutations),
-- with the actual OWNER/MANAGER-only enforcement done in application code
-- (lib/auth/permissions.ts) -- RLS here only prevents cross-tenant *reads*,
-- which is the property that matters for this table specifically.
create policy organization_invitations_member_select on organization_invitations
  for select using (is_org_member(organization_id));
