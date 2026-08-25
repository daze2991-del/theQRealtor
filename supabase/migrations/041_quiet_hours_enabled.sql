-- ═══════════════════════════════════════════════════════════════════════════
-- 041 — Explicit on/off flag for Quiet Hours.
--
-- profiles.quiet_hours_start/end (020_sms_automation.sql) default to
-- 21:00/08:00 with no way to turn the window off — isQuietHours() only
-- returns false when start === end, which nothing in the UI could set on
-- purpose (the Settings page has no toggle, and clearing the time inputs to
-- empty string silently no-ops due to a falsy guard in update-profile, fixed
-- alongside this in the same deploy). In effect, every agent is always in
-- quiet-hours mode today.
--
-- default TRUE is deliberate: both existing profile rows currently sit at the
-- 21:00/08:00 defaults, i.e. they are already, in effect, "quiet hours on".
-- Adding this column with default true is a no-op for current behavior —
-- nothing about how existing agents' alerts are held changes as a result of
-- this migration by itself.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.profiles
  add column if not exists quiet_hours_enabled boolean not null default true;

comment on column public.profiles.quiet_hours_enabled is
  'Master on/off for quiet-hours alert holding. When false, queueOrSendAgentSms() sends immediately regardless of quiet_hours_start/end — the time fields are preserved, not cleared, so re-enabling restores the agent''s prior window.';
