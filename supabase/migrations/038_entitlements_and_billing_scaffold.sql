-- ═══════════════════════════════════════════════════════════════════════════
-- 038 — Entitlement plumbing + inert billing scaffold.
--
-- Strictly additive. Adds one column to signs, one to profiles, and one new
-- table. No data is rewritten, no policy changes, no existing column altered.
--
-- ⚠️  APPLY THIS BEFORE DEPLOYING THE MATCHING CODE. app/api/signs/create and
--     components/DashboardLayout both filter on signs.archived_at once the code
--     ships; if the column is missing those queries error and sign creation /
--     the sidebar counter break. Migration first, then deploy.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- 1 — signs.archived_at: sign lifecycle, distinct from ASSIGNMENT lifecycle.
--
-- These are two different things and conflating them would be wrong:
--   • sign_assignments.unassigned_at — "this sign is not currently on a listing"
--     (normal, temporary; the sign is still live inventory between listings)
--   • signs.archived_at              — "this sign is retired from inventory"
--     (the physical sign is gone/binned; stops counting toward the plan limit)
--
-- An archived sign keeps its rows, history, and scan attribution — it is NOT a
-- delete. Its printed QR still resolves through /p/{sign.id} exactly as before;
-- archiving is purely an entitlement-accounting concept.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.signs
  add column if not exists archived_at timestamptz;

comment on column public.signs.archived_at is
  'When the agent retired this sign from active inventory. NULL = active, counts toward the per-plan active-sign limit. Archiving does NOT disable the sign''s buyer page or delete history.';

-- The only query shape entitlement enforcement uses: active signs per agent.
create index if not exists signs_agent_active_idx
  on public.signs (agent_id) where archived_at is null;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2 — profiles.billing_interval: how an entitlement was granted.
--
-- 'manual' is a first-class value, not a fallback. A hand-managed paying agent
-- looks like: plan='pro', account_status='paid', billing_interval='manual',
-- stripe_customer_id=NULL. The app reads plan/account_status for entitlements
-- and never cares which billing path produced them.
--
-- NULL is allowed and means "not applicable / never set" (all beta rows today).
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists billing_interval text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname  = 'profiles_billing_interval_check'
  ) then
    alter table public.profiles
      add constraint profiles_billing_interval_check
      check (billing_interval is null or billing_interval in ('manual', 'month', 'year'));
  end if;
end $$;

comment on column public.profiles.billing_interval is
  'How the current entitlement is billed: manual | month | year, or NULL if unset. Independent of plan/account_status — the app never branches on this for entitlements.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 3 — stripe_webhook_events: idempotency ledger AND the "tell me what happened"
-- log. Stripe retries deliveries and can send the same event id more than once;
-- the primary key on event_id is what makes replay a no-op.
--
-- Rows are written for EVERY signature-verified event, including while
-- BILLING_AUTOMATION_ENABLED is false — that is the point: Stripe reports what
-- happened, the app records it, and nothing acts on it.
--
-- livemode is stored so test-mode and live-mode events are always
-- distinguishable after the fact.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.stripe_webhook_events (
  event_id     text        primary key,
  type         text        not null,
  livemode     boolean     not null,
  automation_enabled boolean not null,
  acted        boolean     not null default false,
  payload_summary jsonb,
  received_at  timestamptz not null default now()
);

comment on table public.stripe_webhook_events is
  'Append-only ledger of signature-verified Stripe webhook events. PK on event_id provides idempotency across Stripe retries. acted=false means the event was logged but changed no entitlement (the normal state while BILLING_AUTOMATION_ENABLED is false).';

-- Service-role only. RLS on with no policies means no anon/authenticated access.
alter table public.stripe_webhook_events enable row level security;

-- ⚠️  REQUIRED — do not omit. This project does NOT auto-grant privileges on
-- newly created tables (verified empirically: a service-role read against this
-- table returned 42501 "permission denied" until these grants were added, and
-- public.sms_send_log from migration 032 has the same defect and is silently
-- failing every insert today).
--
-- RLS is not the mechanism keeping anon/authenticated out here — the absence of
-- a grant is. Both layers are deliberate: no grant, and no policy.
--
-- The webhook needs INSERT (the idempotency claim), SELECT, and UPDATE (marking
-- acted=true). anon/authenticated are granted nothing.
grant select, insert, update on public.stripe_webhook_events to service_role;

create index if not exists stripe_webhook_events_received_idx
  on public.stripe_webhook_events (received_at desc);
