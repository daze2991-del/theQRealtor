-- ═══════════════════════════════════════════════════════════════════════════
-- 055 — SMS opt-out foundation: consent state, append-only consent log, and
-- a normalized E.164 buyer phone on leads.
--
-- Numbered 055, not 054: 054_subscription_cancellation_tracking.sql exists on
-- the unmerged stripe-subscription-tracking branch and is already applied
-- live, so 054 is taken even though main does not have that file yet.
--
-- Schema only. Nothing reads or writes these tables yet — the inbound webhook
-- (keyword handling), suppression inside lib/twilio.ts sendSms(), and the
-- dashboard badges are later steps. The app/api/submit-lead and
-- app/api/open-house-checkin routes start writing leads.phone_e164 in the
-- same change that adds this migration.
--
-- 1. sms_contacts — ONE row per phone number: that number's CURRENT consent
--    state. Opt-out is platform-wide: an opted-out number is blocked for every
--    agent and every send path. No row = never opted out.
--
-- 2. sms_consent_events — append-only audit log of every opt-out / opt-in /
--    help event, with evidence (what they sent, how it was detected, which of
--    OUR numbers received it). twilio_message_sid is UNIQUE so a retried
--    Twilio webhook cannot double-record the same message.
--
--    APPEND-ONLY, AND WHY THE UPDATE RULE IS NOT A BLANKET BAN: lead_id and
--    agent_id are ON DELETE SET NULL, and Postgres implements that as an
--    UPDATE on this table — a trigger that rejected every UPDATE would make it
--    impossible to delete a lead or an agent that has ever had a consent
--    event. So the trigger allows an UPDATE only when ALL of these hold:
--      • every column other than lead_id / agent_id is unchanged,
--      • lead_id / agent_id either stay the same or become NULL (never a new
--        value — a row can't be re-pointed at a different lead/agent), and
--      • the UPDATE was issued by another trigger (pg_trigger_depth() > 1).
--        The FK's ON DELETE SET NULL runs inside Postgres's own RI trigger on
--        the parent table, so it satisfies this; a hand-written
--        "UPDATE sms_consent_events SET lead_id = NULL" is a top-level
--        statement (depth 1) and is refused.
--    DELETE and TRUNCATE are always refused.
--
-- 3. leads.phone_e164 — the buyer's phone normalized to E.164 by
--    lib/phone.ts normalizePhone(), alongside the untouched raw leads.phone.
--    NULL when no phone was given or it didn't parse. Non-unique: the same
--    buyer can legitimately be a lead on several properties/agents.
--
-- SECURITY: RLS on, no policies, and all privileges revoked from anon and
-- authenticated — agents only ever see opt-out data through server routes.
-- service_role gets exactly what the webhook will need and nothing more
-- (no DELETE anywhere, and no UPDATE on the log). Grants are explicit because
-- this project's default privileges do NOT give service_role
-- SELECT/INSERT/UPDATE on new tables — the cause of an earlier silent 42501
-- outage (see 045/046).
--
-- Applied to the live project on 2026-09-29.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Shared updated_at maintenance ────────────────────────────────────────────
-- No existing updated_at trigger function in this schema; this one is generic
-- so later tables can reuse it.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ── 1. sms_contacts ──────────────────────────────────────────────────────────
create table if not exists public.sms_contacts (
  phone_e164      text        primary key
                              check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  status          text        not null
                              check (status in ('opted_out', 'opted_in')),
  opted_out_at    timestamptz,
  opted_in_at     timestamptz,
  last_event_type text,
  last_keyword    text,
  last_our_number text,        -- which of our Twilio numbers received the latest event
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.sms_contacts is
  'Current SMS consent state per phone number (E.164). Platform-wide: opted_out blocks all sends to that number. No row = never opted out. History lives in sms_consent_events.';

drop trigger if exists sms_contacts_set_updated_at on public.sms_contacts;
create trigger sms_contacts_set_updated_at
  before update on public.sms_contacts
  for each row execute function public.set_updated_at();

-- ── 2. sms_consent_events ────────────────────────────────────────────────────
create table if not exists public.sms_consent_events (
  id                 uuid        primary key default gen_random_uuid(),
  phone_e164         text        not null
                                 check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  event_type         text        not null
                                 check (event_type in ('opt_out', 'opt_in', 'help')),
  detection_source   text        not null
                                 check (detection_source in ('twilio_opt_out_type', 'keyword_match', 'freeform_match')),
  matched_keyword    text,
  message_body       text        check (char_length(message_body) <= 500),  -- evidence of what they sent
  our_number         text        not null,   -- which of our Twilio numbers received it
  twilio_message_sid text        not null unique,  -- idempotency against webhook retries
  lead_id            uuid        references public.leads(id)    on delete set null,
  agent_id           uuid        references public.profiles(id) on delete set null,
  received_at        timestamptz not null default now()
);

comment on table public.sms_consent_events is
  'Append-only audit log of SMS opt-out / opt-in / help events. UPDATE is refused except the FK-driven ON DELETE SET NULL of lead_id/agent_id; DELETE and TRUNCATE are always refused.';

create index if not exists sms_consent_events_phone_received_idx
  on public.sms_consent_events (phone_e164, received_at desc);

create index if not exists sms_consent_events_agent_idx
  on public.sms_consent_events (agent_id)
  where agent_id is not null;

create or replace function public.sms_consent_events_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'sms_consent_events is append-only: DELETE is not permitted';
  elsif tg_op = 'TRUNCATE' then
    raise exception 'sms_consent_events is append-only: TRUNCATE is not permitted';
  end if;

  -- UPDATE: only the FK-driven ON DELETE SET NULL of lead_id / agent_id.
  if (to_jsonb(new) - 'lead_id' - 'agent_id') is distinct from (to_jsonb(old) - 'lead_id' - 'agent_id')
     or (new.lead_id  is not null and new.lead_id  is distinct from old.lead_id)
     or (new.agent_id is not null and new.agent_id is distinct from old.agent_id)
     or pg_trigger_depth() < 2
  then
    raise exception 'sms_consent_events is append-only: UPDATE is not permitted (only an FK ON DELETE SET NULL of lead_id/agent_id is allowed)';
  end if;

  return new;
end;
$$;

drop trigger if exists sms_consent_events_no_update_delete on public.sms_consent_events;
create trigger sms_consent_events_no_update_delete
  before update or delete on public.sms_consent_events
  for each row execute function public.sms_consent_events_append_only();

drop trigger if exists sms_consent_events_no_truncate on public.sms_consent_events;
create trigger sms_consent_events_no_truncate
  before truncate on public.sms_consent_events
  for each statement execute function public.sms_consent_events_append_only();

-- ── 3. leads.phone_e164 ──────────────────────────────────────────────────────
alter table public.leads
  add column if not exists phone_e164 text;

do $$ begin
  alter table public.leads
    add constraint leads_phone_e164_check
    check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$');
exception when duplicate_object then null; end $$;

create index if not exists leads_phone_e164_idx
  on public.leads (phone_e164)
  where phone_e164 is not null;

comment on column public.leads.phone_e164 is
  'Buyer phone normalized to E.164 by lib/phone.ts normalizePhone(). NULL when no phone was given or it did not parse. leads.phone keeps the raw input unchanged.';

-- ── 4. Security ──────────────────────────────────────────────────────────────
alter table public.sms_contacts       enable row level security;
alter table public.sms_consent_events enable row level security;

-- Start from nothing, then grant exactly what's intended.
revoke all on public.sms_contacts       from public, anon, authenticated, service_role;
revoke all on public.sms_consent_events from public, anon, authenticated, service_role;

grant select, insert, update on public.sms_contacts       to service_role;
grant select, insert         on public.sms_consent_events to service_role;

-- Trigger functions are invoked by triggers, never called directly.
revoke all on function public.set_updated_at()                  from public, anon, authenticated;
revoke all on function public.sms_consent_events_append_only()  from public, anon, authenticated;
