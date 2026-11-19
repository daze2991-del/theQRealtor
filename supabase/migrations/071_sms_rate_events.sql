-- 071 — Durable SMS rate-limit events
--
-- Backs the caps in lib/smsLimits.ts. Counted from the database so they hold
-- across serverless instances (the old in-memory limiters reset on every cold
-- start). Separate from sms_send_log on purpose: that table feeds the
-- 100-texts-per-agent-per-day founder alarm and must keep counting only what
-- it counts today.
--
-- One row per attempt:
--   kind        buyer_confirmation | verification_code | lead_request | send_code_request
--   phone_hash  sha256 of the destination E.164 number (never the number itself)
--   listing_id  the listing the buyer text was for (no FK on purpose)
--   ip_hash     sha256 of the client IP (never the IP itself)
--   allowed     false once an attempt is refused; refused attempts are kept as
--               the audit trail but don't count toward any cap
--
-- Service-role only. RLS on with no policies, nothing granted to anon or
-- authenticated. Creates an empty table: changes no existing rows.

create table if not exists public.sms_rate_events (
  id          uuid        primary key default gen_random_uuid(),
  kind        text        not null,
  phone_hash  text,
  listing_id  uuid,
  ip_hash     text,
  allowed     boolean     not null default true,
  created_at  timestamptz not null default now()
);

alter table public.sms_rate_events enable row level security;

revoke all on public.sms_rate_events from anon, authenticated;
grant select, insert, update on public.sms_rate_events to service_role;

create index if not exists sms_rate_events_phone_idx
  on public.sms_rate_events (kind, phone_hash, created_at) where phone_hash is not null;
create index if not exists sms_rate_events_listing_idx
  on public.sms_rate_events (kind, listing_id, created_at) where listing_id is not null;
create index if not exists sms_rate_events_ip_idx
  on public.sms_rate_events (kind, ip_hash, created_at) where ip_hash is not null;
