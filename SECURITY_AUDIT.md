# Security audit — `app/api/**` (Phase 2D)

**Date:** 2026-08-15
**Scope:** every route under `app/api/**`, ahead of the SEO Decision Engine (Phase 2D) being the first feature that surfaces cross-cutting, multi-website data in one place.

## Headline finding

There is **no per-user/per-client session system anywhere in this codebase**. The admin UI (`/admin/**`) is gated by a single shared operator password (`ADMIN_PASSWORD`, HTTP Basic Auth, checked in `proxy.ts`). Before this audit, **every route under `/api/**` except `/api/scheduler/run`** (its own `CRON_SECRET` bearer check) **had zero authentication at all** — anyone on the internet who could reach the deployment could read or mutate any organization's data (list/create organizations and websites, trigger crawls/audits/AI opportunity generation/keyword discovery/Search Console syncs, read pages/issues/tasks/jobs for any website, and update any task's status) with no credential whatsoever.

Because there's no caller *identity* concept, "verify organisation membership" in the sense the Phase 2D spec asks for — confirm that a specific logged-in user is a member of the organization they're trying to touch — **cannot be honestly built without the not-yet-built client-auth system** (Supabase Auth sessions backed by `memberships`, which the schema and RLS policies already anticipate but the app never uses — it always connects with the service-role key, which bypasses RLS entirely). Inventing a fake per-tenant check now (e.g. trusting a client-supplied organization id) would be worse than admitting the gap, so this phase does exactly what's honestly achievable today and documents the rest.

## What Phase 2D fixes

1. **`proxy.ts` now also gates `/api/**`** with the same `ADMIN_PASSWORD` Basic Auth already used for `/admin/**`, closing the "anonymous internet access" gap for every route below except the two that structurally can't carry it (see the "Deferred" section). This is a **single shared operator credential**, not real multi-tenant isolation — it stops an anonymous stranger from calling these routes, but does not distinguish between different client organizations (there is currently exactly one trust boundary: "has the operator password" vs "doesn't"). Documented here, not oversold in code comments or the README.
2. **Fixed one real IDOR-shaped bug**: `app/admin/actions.ts`'s `triggerAndReturn` previously trusted a client-supplied hidden `organization_id` form field instead of deriving it from the website row server-side. Every `app/api/**` trigger route already did this correctly (verified by reading all of them during this audit) — the admin server actions were the one inconsistency. Fixed via `lib/api/authorize.ts`'s `assertWebsiteBelongsToOrganization()`, unit-tested in `lib/api/authorize.test.ts`.

## Full route inventory

| Route | Method | Data sensitivity | Auth before Phase 2D | Auth after Phase 2D |
|---|---|---|---|---|
| `/api/organizations` | GET/POST | List/create orgs | None | Basic Auth (widened) |
| `/api/organizations/[id]/websites` | GET/POST | List/create websites for an org | None | Basic Auth (widened) |
| `/api/websites/[id]` | GET | Read a website | None | Basic Auth (widened) |
| `/api/websites/[id]/crawl` | POST | Trigger a crawl job | None | Basic Auth (widened) |
| `/api/websites/[id]/audit` | POST | Trigger an audit job | None | Basic Auth (widened) |
| `/api/websites/[id]/opportunities` | GET/POST | Read/trigger AI opportunities | None | Basic Auth (widened) |
| `/api/websites/[id]/pages` | GET | Read crawled pages | None | Basic Auth (widened) |
| `/api/websites/[id]/issues` | GET | Read SEO issues | None | Basic Auth (widened) |
| `/api/websites/[id]/tasks` | GET | Read tasks | None | Basic Auth (widened) |
| `/api/websites/[id]/keyword-discovery` | POST | Trigger keyword discovery (AI cost) | None | Basic Auth (widened) |
| `/api/websites/[id]/search-console-sync` | POST | Trigger a GSC sync | None | Basic Auth (widened) |
| `/api/websites/[id]/search-performance-analysis` | POST | Trigger the decision engine (AI cost) | None (new in Phase 2D) | Basic Auth |
| `/api/tasks/[id]` | PATCH | **Mutate** any task by id | None | Basic Auth (widened) |
| `/api/jobs/[id]` | GET | Read any job's status/result | None | Basic Auth (widened) |
| `/api/jobs/process` | POST | Drain all pending jobs across every org (AI cost) | None | Basic Auth (widened) |
| `/api/scheduler/run` | GET/POST | Run the full scheduled sweep across every org | `Authorization: Bearer $CRON_SECRET`, checked in-handler | Unchanged — excluded from the Basic Auth widening (GitHub Actions/Vercel Cron can't send Basic Auth) |
| `/api/auth/google-search-console/start` | GET | Begins an OAuth grant, binding a Google account to a website's GSC connection | None | Basic Auth (widened) — closes a real hijack risk: previously anyone could start this flow for any website id and overwrite its connection |
| `/api/auth/google-search-console/callback` | GET | Completes the OAuth grant | Signed, expiring `state` param (`lib/search-console/state.ts`) | Unchanged — excluded from the Basic Auth widening (Google's redirect can't carry it); the signed state param remains the actual defence here and was already sufficient |

## Deferred — requires the future client-auth architecture

The following is **not fixable today** without building real per-user sessions, and is called out explicitly rather than papered over:

- **True cross-tenant isolation.** Even with Basic Auth on every route, a caller who knows the operator password (today: whoever operates this platform) can read/mutate *any* organization's data — there is no notion of "this user may only touch organization X." Fixing this requires: Supabase Auth sessions, a login flow, `memberships`-based row scoping in application code (or switching the Supabase client used by request-scoped code from the service-role key to a user-scoped key so RLS — already written — actually applies).
- **Per-organization API credentials.** If/when clients need programmatic API access, they'll need their own scoped tokens, not the shared operator password.

Until then: treat this deployment as **single-operator** — one team, one shared credential, trusted to only touch what they should. Do not expose `ADMIN_PASSWORD` beyond that team, and do not onboard a client who needs their data isolated from other clients' operators without first building the above.

## Addendum: `/api/businessos-integration/**` (Phase 3D)

Two new routes, added for a separate, independent product (BusinessOS) to verify an organisation and request an invitation on a customer's behalf — see that platform's own `docs/architecture.md` ("Growth module (SEO)") for the full cross-product rationale. Neither route is part of the `/api/**` Basic Auth surface described above; both are explicitly excluded in `proxy.ts` (same mechanism as `/api/scheduler/run`) and instead authenticate with their own dedicated bearer credential.

| Route | Method | Data sensitivity | Auth |
|---|---|---|---|
| `/api/businessos-integration/verify-organization` | POST | Returns only `{ organizationId, name, slug }` for one organisation — no operational data | `Authorization: Bearer $BUSINESSOS_INTEGRATION_SECRET`, timing-safe compared (`lib/api/businessos-auth.ts`) |
| `/api/businessos-integration/invitations` | POST | Creates a real `organization_invitations` row (existing Phase 7 mechanism, unchanged) for a given org/email/role, or reports the email already has a membership | Same |
| `/api/businessos-integration/invitation-status` | POST | Read-only — returns only `{ status }` for one invitation id the caller already knows | Same |

Both routes additionally require `organizations.businessos_integration_enabled = true` for the target organisation (see "Per-organisation allowlist" below) — this section describes the full, hardened behaviour as of the Phase 3D hardening pass, not just the initial Phase 3D commit.

Security properties specific to this integration:

- **A dedicated credential, not a widened one.** `BUSINESSOS_INTEGRATION_SECRET` is its own environment variable, checked with `crypto.timingSafeEqual` (stronger than `CRON_SECRET`'s plain `===`, since this credential can create real memberships, not just trigger a job sweep). It is never `ADMIN_PASSWORD`, and a caller holding it gets exactly these two operations — nothing else `/admin`/`/api` exposes.
- **Role validation is strict, and narrower than this platform's own vocabulary.** `/invitations` accepts only `OWNER`/`MANAGER`/`VIEWER` — the dead Phase 1 enum values (`owner`/`admin`/`member`) are rejected as before, and, as of the Phase 3D hardening pass, `EDITOR` is *also* deliberately rejected even though it's a real, current role. BusinessOS's own approved role mapping never produces `EDITOR`, so the integration has no legitimate reason to accept it; excluding it narrows what a compromised `BUSINESSOS_INTEGRATION_SECRET` could grant. This restriction applies only to requests authenticated as the BusinessOS integration — the normal, human-facing Settings-page invitation flow (`app/dashboard/actions.ts`) is unchanged and still grants all four real roles, `EDITOR` included.
- **Per-organisation allowlist caps blast radius.** `organizations.businessos_integration_enabled` (migration `0029`, `boolean not null default false`) gates both endpoints — every organisation, including every existing customer, defaults to *not* allowlisted. Both routes return the identical 404 "Organisation not found" whether an id doesn't exist at all or simply isn't allowlisted, so a stolen secret can't distinguish the two or enumerate real organisation ids. **The integration credential cannot enable this flag for itself or any organisation**: there is no application code path anywhere in this repository — no RLS policy, no dashboard action, no admin UI, no API route, including neither of the two businessos-integration routes themselves — that writes to this column (confirmed by grepping the whole repository for any `.from("organizations").update(...)`/`.upsert(...)`: none exist). Enabling an organisation is, for now, a deliberate, manual, admin-side SQL operation (`update organizations set businessos_integration_enabled = true where id = '...'`), never something the integration's own request can trigger. Without an organisation being explicitly allowlisted this way, a valid `BUSINESSOS_INTEGRATION_SECRET` grants access to *zero* organisations — the credential alone is not sufficient to reach any customer's data.
- **No new trust in "is this a real person."** The invitation-acceptance flow (`app/dashboard/accept-invite/**`) is completely unchanged — a BusinessOS-requested invitation still requires the recipient to set a password or sign in with their existing SEO account, exactly as a manually-sent invitation does. This integration can request that an invitation be sent; it cannot grant access on its own.
- **Idempotent by construction, not just by courtesy.** A repeated request for the same (org, email) either reports the existing pending invitation's id or the existing membership, and the underlying unique index (migration 0027) is the actual backstop if two requests race.
- **Known limitation — rate limiting.** `lib/api/rate-limit.ts` is an in-memory, single-instance limiter — adequate for today's single known caller, not a durable multi-instance solution. Upgrade to a shared store (e.g. the existing Postgres, or a dedicated store) if the caller pool ever grows beyond one trusted integration.
- **Known limitation — attribution.** Invitations created this way have `invited_by = null` (that column has always been nullable) rather than a synthetic system user, per an explicit product decision — see `lib/db/invitations.ts`'s `CreateInvitationInput` comment. A `null` `invited_by` on an otherwise-normal invitation row is how to distinguish a BusinessOS-originated invite from a Settings-page one today; there is no separate "source" column.
- **Known limitation — no allowlist management UI.** Enabling an organisation for this integration is a manual database operation today, deliberately not exposed through `/admin` in this pass. A future phase may add a toggle to `/admin/organizations/[id]`, still gated by the existing `ADMIN_PASSWORD` boundary and never by the integration's own credential.

## Addendum: `/api/businessos-integration/invitation-status` (Phase 3F)

A third route, purely additive to the two above and gated identically (same bearer credential, same `businessos_integration_enabled` allowlist). Lets BusinessOS poll one specific, already-known invitation's current lifecycle state (`pending`/`accepted`/`revoked`/`expired`) — never a listing, never anything beyond that one enum value. **No mutation capability of any kind is introduced by this route or this phase** — it never writes to `organization_invitations`, `memberships`, or any other table.

- **Reuses, does not re-derive, expiry logic.** `lib/dashboard/invitations.ts`'s `invitationDisplayStatus()` (Phase 7.2C-C, already in production use on the Settings page) is the only place this platform computes "is this invitation actually expired" — `status` never transitions to `'expired'` in the database itself, only past `expires_at` on an otherwise-still-`'pending'` row. `lib/api/businessos-invitation-status.ts`'s `resolveInvitationStatus()` calls that same function rather than re-implementing the comparison, so the two call sites (the Settings page and this route) can never silently drift apart on what "expired" means.
- **Ownership-mismatch guard.** `resolveInvitationStatus()` rejects an invitation id that resolves to a real row belonging to a *different* organisation than the one the caller claimed — the same IDOR-guard shape `lib/api/authorize.ts`'s `assertOwnedByOrganization` already establishes elsewhere in this codebase, expressed as a pure, non-throwing function here since this route has no existing "known-good" resource to fall back to on mismatch.
- **Minimum disclosure preserved.** A nonexistent invitation id and an organisation/invitation mismatch return the exact same generic 404 as the other two routes' "not found" responses — never a distinct error that would let a caller learn *which* case occurred.
- **`proxy.ts` required no change.** The existing `/api/businessos-integration` prefix exclusion already covers this new path.
