-- ═══════════════════════════════════════════════════════════════════════════
-- 057 — Auto-reply throttle for the send-only inbound SMS webhook.
--
-- theQRealtor's Twilio number is SEND-ONLY: app/api/sms/inbound never
-- forwards a text anywhere. An ordinary (non-keyword) inbound text gets at
-- most one short "this number can't receive replies" auto-reply per phone
-- number per 24 hours; this table remembers when that last happened.
--
-- One row per sender. Nothing else is stored — the message body of an
-- ordinary text is never persisted.
--
-- Same lockdown as 055: RLS on with no policies, everything revoked (this
-- project's default privileges hand new tables unusual grants, so reset
-- first), then exactly what the webhook's service-role client needs.
--
-- Applied to the live project on 2026-09-30.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.sms_autoreply_state (
  phone_e164        text        primary key
                                check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  last_autoreply_at timestamptz not null
);

comment on table public.sms_autoreply_state is
  'Throttle for the inbound SMS auto-reply: last time an ordinary inbound text from this number got the "send-only number" reply. At most one per 24h. Service-role only.';

alter table public.sms_autoreply_state enable row level security;

revoke all on public.sms_autoreply_state from public, anon, authenticated, service_role;
grant select, insert, update on public.sms_autoreply_state to service_role;
