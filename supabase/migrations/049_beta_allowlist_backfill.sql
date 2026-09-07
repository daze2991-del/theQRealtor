-- beta_allowlist: backfilled from the live database, which is where this
-- table was originally hand-created.
--
-- Approved emails are production data, added manually via Supabase.
-- They are deliberately NOT seeded here.
--
-- This table is expected to be retired when Phase 3 (payment-gated signup)
-- ships. Don't over-invest in polishing it.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- Why this file exists: nothing in supabase/migrations/ defined this table, so
-- a schema rebuilt from migrations alone would come up without it — and
-- app/api/auth/beta-signup/route.ts would then reject every signup (its
-- allowlist lookup returns nothing, so the route 403s). It fails closed, so
-- this was never a security gap, but the app would be unusable.
--
-- Definition below was read from the live database, not reconstructed from
-- the application's expectations:
--   • columns/types/defaults/nullability — PostgREST OpenAPI introspection
--   • RLS state, policies, grants, constraints — pg_class / pg_policies /
--     information_schema.role_table_grants / pg_constraint
--
-- Idempotent against production: the table already exists there, so CREATE
-- TABLE IF NOT EXISTS is a no-op and the ENABLE RLS / GRANT statements below
-- are all safe to re-run. On a fresh rebuild it produces the table as it
-- exists today.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- Table
--
-- Constraint names are left to PostgreSQL's defaults deliberately: `primary
-- key` on id yields beta_allowlist_pkey and `unique` on email yields
-- beta_allowlist_email_key — byte-identical to the live names, so a rebuilt
-- schema matches production without hand-naming anything.
--
-- The UNIQUE on email is load-bearing, not decorative: beta-signup does
-- .eq('email', …).single(), which errors if two rows ever shared an address.
--
-- approved defaults to TRUE — inserting a bare (email) row grants access.
-- Reproduced as-is because that is the live behavior; noting it because it is
-- the kind of default worth being deliberate about rather than inheriting.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.beta_allowlist (
  id         uuid        primary key default gen_random_uuid(),
  email      text        not null unique,
  approved   boolean     default true,
  joined_at  timestamptz,
  created_at timestamptz default now()
);


-- ─────────────────────────────────────────────────────────────────────────────
-- RLS: enabled, with NO policies — deliberate, not an oversight.
--
-- RLS on + zero policies = anon/authenticated can reach no rows at all. Every
-- read and write goes through app/api/auth/beta-signup/route.ts using the
-- service-role key, which bypasses RLS. There is no client-side access path to
-- this table and none is wanted: a browser must never be able to enumerate or
-- self-add approved emails.
--
-- FORCE ROW LEVEL SECURITY is intentionally left off (matching live), so the
-- table owner is not subject to policies.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.beta_allowlist enable row level security;


-- ─────────────────────────────────────────────────────────────────────────────
-- Grants — reproduced exactly as they exist in production.
--
-- service_role is the only role with real data access, and is what the signup
-- route authenticates as. This project does NOT auto-grant privileges on new
-- tables (see 038, 045, 046 — three separate tables that silently 42501'd at
-- runtime until granted explicitly), so this line is required, not decorative.
--
-- anon/authenticated hold REFERENCES/TRIGGER/TRUNCATE and no data privileges
-- (SELECT/INSERT/UPDATE/DELETE were revoked at some point in this table's
-- hand-created history). Reproduced for fidelity so a rebuilt schema matches
-- production exactly.
--
-- ⚠️  One caveat worth recording rather than silently copying: TRUNCATE is not
-- subject to row-level security — Postgres exempts it from RLS entirely — so
-- it is not made harmless by the RLS above the way SELECT/INSERT/UPDATE/DELETE
-- are. It is not reachable today (PostgREST exposes no TRUNCATE verb, so there
-- is no HTTP path to it), which is why this is a latent wart and not a live
-- vulnerability. If you would rather not carry it forward:
--     revoke truncate on public.beta_allowlist from anon, authenticated;
-- Left in place here because this file's job is to mirror production, and
-- changing the security posture is a separate decision from documenting it.
--
-- postgres also appears in the live grant list; it is the table owner, so its
-- privileges follow from ownership and need no explicit grant here.
-- ─────────────────────────────────────────────────────────────────────────────
grant references, trigger, truncate on public.beta_allowlist to anon, authenticated;

grant select, insert, update, delete on public.beta_allowlist to service_role;
