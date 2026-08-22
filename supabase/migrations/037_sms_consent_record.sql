-- ═══════════════════════════════════════════════════════════════════════════
-- 037 — Provable SMS consent record on leads.
--
-- leads.sms_consent (boolean) already exists and predates this migration: it
-- was added for the open-house check-in flow and is written by
-- app/api/open-house-checkin/route.ts. It records only WHETHER consent was
-- given — not when, and not what the buyer was actually shown.
--
-- The buyer-facing lead form (app/p/[propertyId]/page.tsx) now presents an
-- unchecked affirmative consent checkbox, and the confirmation SMS in
-- app/api/submit-lead/route.ts only fires when it is checked. To make that
-- consent provable after the fact — including after the checkbox wording is
-- later revised — we store the timestamp and a verbatim copy of the text the
-- buyer saw at submission time.
--
-- Strictly additive: two nullable columns, no backfill, no data rewritten, no
-- change to the existing sms_consent column or to any policy.
--
-- NOTE ON HISTORICAL ROWS: leads created before this migration keep
-- sms_consent = false with NULL timestamp/text. That is correct and must not
-- be "fixed" — those leads genuinely had no consent step, and a NULL here is
-- the honest record of that.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.leads
  add column if not exists sms_consent_at   timestamptz,
  add column if not exists sms_consent_text text;

comment on column public.leads.sms_consent_at is
  'UTC timestamp when the buyer checked the SMS consent box. NULL = no consent given (or lead predates the consent checkbox).';

comment on column public.leads.sms_consent_text is
  'Verbatim copy of the consent text displayed to the buyer at submission (see lib/smsConsent.ts SMS_CONSENT_TEXT). Frozen per-row: never update to match newer wording.';
