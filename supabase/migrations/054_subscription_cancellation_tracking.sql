-- ═══════════════════════════════════════════════════════════════════════════
-- 054 — Columns the Stripe subscription webhooks need to record a scheduled
-- cancellation and a failed payment.
--
-- Strictly additive: three nullable columns on profiles, plus a re-declaration
-- of the 024 protection trigger so the new columns are covered by the same
-- defense-in-depth as every other billing field. No data is rewritten, no
-- existing column altered, no policy changed.
--
-- ⚠️  APPLY THIS BEFORE DEPLOYING THE MATCHING CODE. The subscription handlers
--     in app/api/stripe/webhook write all three columns; without them the
--     PostgREST update fails with PGRST204 (column not found) and the webhook
--     returns 500, which makes Stripe retry the delivery forever.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- 1 — Why cancel_at exists, and why cancel_at_period_end alone is not enough.
--
-- VERIFIED LIVE IN TEST MODE (2026-09-16): cancelling a subscription through
-- the Stripe billing portal emits customer.subscription.updated — NOT
-- customer.subscription.deleted — with:
--     status                = 'active'     (still active! it has not ended yet)
--     cancel_at             = <unix ts>    (when it WILL end)
--     cancel_at_period_end  = false        (<-- the trap)
--     cancellation_details  = populated
--
-- cancel_at_period_end reads FALSE even though a cancellation is genuinely
-- scheduled, because the portal schedules the cancellation at a specific
-- instant rather than setting the "at period end" flag. Any code that asks
-- "is this agent cancelling?" by reading that boolean alone answers NO for a
-- real, confirmed, user-initiated cancellation.
--
-- So we store Stripe's raw values faithfully — cancel_at_period_end keeps
-- meaning exactly what Stripe means by it — and add cancel_at alongside it.
-- The correct question is "is either one set?", which lib/subscription.ts
-- answers in one place (cancellationScheduled) so no call site has to
-- re-derive it and get it wrong.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists cancel_at timestamptz;

comment on column public.profiles.cancel_at is
  'When a scheduled cancellation takes effect, from Stripe subscription.cancel_at. NULL = no cancellation scheduled by date. MUST be checked together with cancel_at_period_end — a portal-initiated cancellation sets this while leaving cancel_at_period_end false. See lib/subscription.ts cancellationScheduled().';


-- ─────────────────────────────────────────────────────────────────────────────
-- 2 — cancellation_reason: Stripe's machine-readable reason, not free text.
--
-- From subscription.cancellation_details.reason, one of Stripe's enum values
-- ('cancellation_requested', 'payment_failed', 'payment_disputed', ...). This
-- is what distinguishes "the agent chose to leave" from "we lost their card",
-- which are the same row state otherwise and want completely different
-- outreach.
--
-- Deliberately NOT storing cancellation_details.comment or .feedback: both are
-- free-text/survey fields the customer types, i.e. unbounded user content we
-- have no product use for today. Same reasoning as the webhook ledger's
-- summarize() — do not retain PII without a reason to.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists cancellation_reason text;

comment on column public.profiles.cancellation_reason is
  'Stripe subscription.cancellation_details.reason enum (cancellation_requested | payment_failed | payment_disputed | ...). NULL when no cancellation. Deliberately excludes the free-text comment/feedback fields.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 3 — last_payment_failed_at: the durable record that a renewal charge failed.
--
-- invoice.payment_failed is currently logged to stripe_webhook_events and then
-- ignored. The ledger is append-only and keyed by event id, so answering "is
-- this agent currently behind on payment?" from it means scanning events — the
-- wrong shape for a question the app asks per-profile.
--
-- This is a timestamp, not a boolean, so it is self-clearing in meaning: a
-- value far in the past next to an 'active' subscription_status is a resolved
-- blip, not an outstanding problem. It is NOT a dunning system and does not
-- gate access to anything — it exists so a failed renewal stops vanishing.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists last_payment_failed_at timestamptz;

comment on column public.profiles.last_payment_failed_at is
  'When Stripe last reported a failed invoice payment for this agent (invoice.payment_failed). Informational only — gates nothing, clears nothing automatically. Compare against subscription_status to tell an outstanding failure from a resolved one.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 4 — Extend the 024 entitlement protection trigger to the new columns.
--
-- Layer 2 (column-level GRANT) already covers these: 024 revoked table-wide
-- UPDATE from authenticated/anon and re-granted only the seven user-editable
-- columns, and a newly added column is not in that grant list. So the client
-- roles cannot write these today even without this step.
--
-- This re-declaration is Layer 1, and it is added anyway because 024 states
-- both layers are deliberate. Leaving the trigger's column list stale would
-- mean the next person who adds a column to the grant list — or who grants
-- UPDATE more broadly during a debugging session — silently loses the second
-- layer with no error to notice.
--
-- Identical to 024's function except for the three added comparisons. Still
-- SECURITY INVOKER so auth.role() reflects the real caller; service_role,
-- superuser and migration contexts still return early and stay unrestricted.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.protect_profile_entitlements()
returns trigger
language plpgsql
security invoker
as $$
begin
  if auth.role() is distinct from 'authenticated'
     and auth.role() is distinct from 'anon' then
    return new;  -- service_role / superuser / migrations — unrestricted
  end if;

  if  new.plan                   is distinct from old.plan
   or new.subscription_status    is distinct from old.subscription_status
   or new.price_id               is distinct from old.price_id
   or new.stripe_customer_id     is distinct from old.stripe_customer_id
   or new.stripe_subscription_id is distinct from old.stripe_subscription_id
   or new.current_period_end     is distinct from old.current_period_end
   or new.cancel_at_period_end   is distinct from old.cancel_at_period_end
   or new.trial_end              is distinct from old.trial_end
   or new.is_founding            is distinct from old.is_founding
   -- added in 054
   or new.cancel_at              is distinct from old.cancel_at
   or new.cancellation_reason    is distinct from old.cancellation_reason
   or new.last_payment_failed_at is distinct from old.last_payment_failed_at
  then
    raise exception 'Billing and entitlement fields are managed by the system and cannot be changed here.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

-- The trigger itself is unchanged (024 created it); re-asserted for idempotency
-- so this migration is safe to run on a database that never had 024's trigger.
drop trigger if exists trg_protect_profile_entitlements on public.profiles;
create trigger trg_protect_profile_entitlements
  before update on public.profiles
  for each row execute function public.protect_profile_entitlements();
