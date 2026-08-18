-- Phase 7: Multi-Tenant Client Portal & SaaS.
--
-- `organizations`/`memberships` and every tenant table's `is_org_member()`
-- RLS policy already exist (Phase 1) and are reused as-is -- confirmed via
-- live inspection before writing this migration: `is_org_member()` already
-- checks `memberships.user_id = auth.uid()`, and every tenant table already
-- carries an `is_org_member(organization_id)` policy. What Phase 7 actually
-- adds is real Supabase Auth usage (app-layer, no schema change needed) and
-- the two things genuinely missing at the schema level: richer roles, and
-- an invitation flow.

-- ---------------------------------------------------------------------------
-- Roles: membership_role was 'owner'/'admin'/'member' (Phase 1, never used
-- by any app code -- confirmed via grep before this migration, so nothing
-- existing depends on the old labels). Postgres enums are add-only in a
-- single ALTER TYPE, so the old values remain defined but are simply never
-- used going forward -- no data currently references them (memberships is
-- empty in production use so far).
-- ---------------------------------------------------------------------------

alter type membership_role add value 'OWNER';
alter type membership_role add value 'MANAGER';
alter type membership_role add value 'EDITOR';
alter type membership_role add value 'VIEWER';
