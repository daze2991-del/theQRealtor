-- ═══════════════════════════════════════════════════════════════════════════
-- 052 — Backfill profiles.beta_joined_at into a migration.
--
-- Same gap 049 closed for beta_allowlist: this column was added by hand to the
-- live database and defined in no migration file. A schema rebuilt from
-- migrations alone would come up without it.
--
-- Unlike beta_expires_at (dropped in 051 as dead), this column is load-bearing.
-- It is the sole input to the 90-day beta clock — lib/beta.ts computes
-- expiry as `new Date(beta_joined_at) + 90 days` on the fly — and it is read by:
--   • app/api/properties/route.ts        — server-side gate; blocks property
--                                          creation once the beta has expired
--   • app/dashboard/new-property/page.tsx — client-side pre-check of the same
--   • components/DashboardLayout.tsx      — countdown / expired banners
--   • lib/admin/overview.ts               — admin roster, "trials expiring soon"
-- and written once, at signup, by app/api/auth/beta-signup/route.ts.
--
-- FAILURE MODE IF MISSING: every one of those reads selects the column, so on a
-- rebuilt schema they would error rather than degrade. Worth noting that even
-- when the column exists but is NULL, getBetaStatus() fails OPEN by design
-- (lib/beta.ts logs a warning and reports 90 days remaining) — so a profile row
-- created outside beta-signup silently gets an unlimited beta.
--
-- Definition read from the live database via PostgREST OpenAPI introspection,
-- not reconstructed from what the application appears to expect:
--   type      timestamp with time zone
--   nullable  yes
--   default   none
--
-- Idempotent: the column already exists in production, so ADD COLUMN IF NOT
-- EXISTS is a no-op there. It only does work on a fresh rebuild.
--
-- NOT VERIFIED HERE: indexes and CHECK constraints on this column are not
-- visible through PostgREST, and there is no psql/CLI/connection string in this
-- environment. Admin overview filters on `beta_joined_at IS NOT NULL`, so an
-- index may exist. To confirm, and add a follow-up migration if so:
--     select indexdef from pg_indexes
--     where schemaname='public' and tablename='profiles';
--     select conname, pg_get_constraintdef(oid) from pg_constraint
--     where conrelid='public.profiles'::regclass;
--
-- Run once in the Supabase SQL editor.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.profiles
  add column if not exists beta_joined_at timestamptz;

comment on column public.profiles.beta_joined_at is
  'UTC instant this agent joined the beta. Sole input to the 90-day beta clock, computed on the fly by lib/beta.ts getBetaStatus(); there is no stored expiry date. Set once by /api/auth/beta-signup. NULL fails OPEN (treated as a full 90 days remaining), so rows created outside that route get an unlimited beta.';
