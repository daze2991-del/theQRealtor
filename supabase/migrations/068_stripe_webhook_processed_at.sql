-- 068 — stripe_webhook_events.processed_at: an event only counts as handled
-- once its profile write has succeeded.
--
-- Before this, the webhook inserted the ledger row (the idempotency claim)
-- BEFORE acting, so if the profile write then failed, Stripe's retry hit the
-- primary key and was dropped as a "duplicate" — the change was lost for good.
--
-- Now:
--   • the row is still inserted first (the claim), with processed_at NULL;
--   • processed_at is set only after the entitlement write succeeds (or
--     immediately, for an event that needs no write — e.g. automation off);
--   • a redelivery whose row has processed_at NULL is processed again. That is
--     safe because the handler re-reads the subscription from Stripe and
--     writes absolute values (no increments).
--
-- Strictly additive: adds one nullable column, rewrites no rows. Existing rows
-- (all observe-only, already answered 200) keep processed_at NULL. Stripe does
-- not redeliver events it got a 2xx for; if one is ever resent by hand it is
-- simply handled again, which is harmless for the reason above.
--
-- ⚠️ APPLY BEFORE DEPLOYING the matching app/api/stripe/webhook/route.ts — the
-- route writes this column on every signature-verified event, including while
-- BILLING_AUTOMATION_ENABLED is off. Without it every delivery returns 500.
--
-- ROLLBACK: alter table public.stripe_webhook_events drop column if exists processed_at;
-- (then redeploy the previous webhook route).

alter table public.stripe_webhook_events
  add column if not exists processed_at timestamptz;

comment on column public.stripe_webhook_events.processed_at is
  'When the event was fully handled. NULL = claimed but not yet handled (or recorded before migration 068); a Stripe redelivery of the same event_id is processed again.';
