-- 065 — Notification-channel columns on profiles: email alerts (new) and a
-- real SMS master toggle (replacing a broken one).
--
-- email_alerts_enabled: new. Defaults true for everyone (including existing
-- agents) — there's no prior "off" state to preserve, and email alerts are
-- available on every plan.
--
-- sms_alerts_enabled: replaces the SMS "Lead Alerts" toggle, which today
-- lives in auth.users.raw_user_meta_data->>'sms_enabled' (written by
-- app/api/update-profile) and, when turned off, only nulls
-- properties.agent_phone — profiles.phone (which resolveAgentPhone() checks
-- FIRST) is untouched, so turning the toggle off does not actually stop a
-- send. This column becomes the one real, server-checked master switch.
--
-- Default FALSE for brand-new rows, matching the SMS consent page's own
-- "off by default" language. Existing agents keep their current live
-- behavior via the backfill below, which reads each one's current
-- auth metadata the same way Settings does today (meta.sms_enabled !== false
-- means enabled) — this UPDATE touches every existing profiles row (2 live
-- rows today: the founder and the test account) and changes only this one
-- new column, nothing else.

alter table public.profiles add column if not exists email_alerts_enabled boolean not null default true;
alter table public.profiles add column if not exists sms_alerts_enabled   boolean not null default false;

comment on column public.profiles.email_alerts_enabled is
  'Agent opt-in for lead-alert emails (showing requests, questions). Independent of SMS. Default true.';
comment on column public.profiles.sms_alerts_enabled is
  'Agent master toggle for lead-alert SMS, checked server-side before every agent-facing SMS send. Default false for new agents (matches the SMS consent page''s "off by default"). Replaces the old auth.user_metadata.sms_enabled mechanism, which did not actually stop sends.';

-- One-time backfill for existing agents only: preserve today's live
-- behavior (meta.sms_enabled !== false => enabled) rather than silently
-- flipping everyone's SMS alerts off when this ships.
update public.profiles p
set sms_alerts_enabled = (u.raw_user_meta_data ->> 'sms_enabled') is distinct from 'false'
from auth.users u
where u.id = p.id;
