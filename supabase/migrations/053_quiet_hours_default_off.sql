-- ═══════════════════════════════════════════════════════════════════════════
-- 053 — Flip quiet_hours_enabled's default from true to false.
--
-- 041 set this to default TRUE because at the time every agent was, in
-- effect, always in quiet-hours mode (no toggle existed yet to turn it off).
-- That has since changed: app/dashboard/settings/page.tsx now has a real
-- toggle, so an agent can already choose to disable quiet hours today. This
-- migration only changes what a NEW agent starts with.
--
-- New agents will now get real-time SMS delivery around the clock unless they
-- explicitly opt into quiet hours via that Settings toggle.
--
-- Confirmed safe before writing this:
--   • Does not retroactively change any existing row — column defaults only
--     apply to future inserts, not rows already in the table.
--   • Does not require touching app/api/auth/beta-signup/route.ts — that
--     route has never set this column explicitly; it has always relied on
--     the column default, so changing the default is sufficient by itself.
--   • lib/twilio.ts queueOrSendAgentSms() already gates on
--     agent.quiet_hours_enabled BEFORE evaluating the time-window predicate
--     (isQuietHours()) — when the flag is false, the quiet_hours_start/end
--     values (still defaulted to 21:00/08:00) are simply never consulted, so
--     they can be left as-is with no behavioral effect.
--
-- Run once in the Supabase SQL editor.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.profiles
  alter column quiet_hours_enabled set default false;
