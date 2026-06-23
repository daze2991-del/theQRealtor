-- 026_onboarding_completed.sql
-- Tracks whether an agent has finished (or skipped) the guided onboarding wizard.
-- Run once in the Supabase SQL editor.

alter table public.profiles
  add column if not exists onboarding_completed boolean not null default false;

-- 024 revoked table-wide UPDATE on profiles from the authenticated role and grants
-- only specific user-editable columns. The wizard sets this flag from the client
-- session, so it must be granted. It is plain UI state — NOT a protected
-- billing/entitlement column, and it is NOT listed in the 024
-- protect_profile_entitlements() trigger, so client updates to it are allowed.
grant update (onboarding_completed) on public.profiles to authenticated;
