-- 069 — auto_renewal_consents: proof that a person agreed to automatic renewal
-- before a subscription was created or changed.
--
-- California's Automatic Renewal Law (Bus. & Prof. Code § 17600 et seq., as
-- amended by AB 2863) requires affirmative consent to the auto-renewal terms
-- and a record of it. app/api/stripe/checkout and app/api/stripe/change-plan
-- insert ONE row here, server-side, BEFORE they create a Checkout Session or
-- change a subscription. If the insert fails they refuse — no row, no charge.
--
-- RETENTION: keep every row for AT LEAST 3 YEARS (the ARL requires keeping
-- proof of consent for the longer of 3 years or one year after the
-- subscription ends). Nothing in this project deletes from this table:
-- run_retention_cleanup() (migration 064) names its tables explicitly
-- (scan_events, sms_consent_events, retention_runs) and does not touch it —
-- tests/stripe-consent.test.ts asserts that. The trigger below also refuses
-- UPDATE and TRUNCATE outright, and refuses DELETE of any row younger than
-- 3 years, so even a stray manual statement cannot remove recent proof.
--
-- user_id deliberately has NO foreign key to auth.users: the proof must
-- outlive the account (a cascade on account deletion would destroy it).
--
-- consent_text is the exact text shown: the plain-text disclosure plus the
-- checkbox label, as one string (lib/autoRenewal.ts autoRenewalConsentText).
-- consent_version matches AUTO_RENEWAL_CONSENT_VERSION in that file; any
-- wording change there bumps the version.
--
-- Monthly only: interval is constrained to 'month'. Annual billing is off and
-- has no consent wording; loosen the check in a later migration when it does.
--
-- ⚠️ APPLY BEFORE DEPLOYING the matching checkout / change-plan routes —
-- without this table every checkout and plan change is refused. (They also
-- sit behind PAID_PLANS_ENABLED / STRIPE_CHARGES_ENABLED, so nothing breaks
-- for anyone while those are off.)
--
-- ROLLBACK:
--   drop table if exists public.auto_renewal_consents;
--   drop function if exists public.auto_renewal_consents_protect();
-- (this destroys consent records — export them first if any exist)

create table if not exists public.auto_renewal_consents (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null,
  plan            text        not null check (plan in ('starter', 'pro')),
  price_cents     integer     not null check (price_cents > 0),
  interval        text        not null check (interval = 'month'),
  consent_text    text        not null check (length(consent_text) > 0),
  consent_version text        not null check (length(consent_version) > 0),
  created_at      timestamptz not null default now(),
  ip              text,
  user_agent      text
);

comment on table public.auto_renewal_consents is
  'Proof of California auto-renewal consent: exact text shown, version, plan, price, IP, user agent, time. One row per checkout / plan-change attempt that passed the consent checks. Service role only. KEEP AT LEAST 3 YEARS — never delete younger rows; not touched by run_retention_cleanup().';

create index if not exists auto_renewal_consents_user_idx
  on public.auto_renewal_consents (user_id, created_at desc);

-- ── Service role only ────────────────────────────────────────────────────────
-- RLS on with NO policies, and no grants to anon/authenticated: agents can
-- neither read nor write these rows. (This project does not auto-grant
-- privileges on new tables — see 038 — so the grant below is required.)
-- service_role gets INSERT and SELECT only: no UPDATE, no DELETE, no TRUNCATE.
-- Supabase's default privileges hand service_role extra rights (TRUNCATE,
-- REFERENCES, TRIGGER) on every new public table, so they are revoked
-- explicitly before the two grants below.
alter table public.auto_renewal_consents enable row level security;
revoke all on public.auto_renewal_consents from public, anon, authenticated, service_role;
grant select, insert on public.auto_renewal_consents to service_role;

-- ── Append-only, 3-year floor ────────────────────────────────────────────────
create or replace function public.auto_renewal_consents_protect()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
begin
  if tg_op = 'DELETE' then
    if old.created_at < now() - interval '3 years' then
      return old;
    end if;
    raise exception 'auto_renewal_consents: rows must be kept for at least 3 years';
  end if;
  raise exception 'auto_renewal_consents is append-only: % is not permitted', tg_op;
end;
$function$;

drop trigger if exists trg_auto_renewal_consents_protect on public.auto_renewal_consents;
create trigger trg_auto_renewal_consents_protect
  before update or delete on public.auto_renewal_consents
  for each row execute function public.auto_renewal_consents_protect();

drop trigger if exists trg_auto_renewal_consents_no_truncate on public.auto_renewal_consents;
create trigger trg_auto_renewal_consents_no_truncate
  before truncate on public.auto_renewal_consents
  for each statement execute function public.auto_renewal_consents_protect();
