-- 025_welcome_screen.sql
-- One-time post-signup "You're Live!" welcome screen flag.
-- Run once in the Supabase SQL editor.

alter table public.profiles
  add column if not exists has_seen_welcome boolean not null default false;

-- 024 revoked table-wide UPDATE on profiles from the authenticated role and grants
-- only specific user-editable columns. The welcome screen marks itself seen from
-- the browser, so has_seen_welcome must be in the authenticated grant list — it is
-- user UI state, not a protected billing/entitlement column.
grant update (has_seen_welcome) on public.profiles to authenticated;
