-- 024_entitlement_hardening.sql
-- Security hardening for subscription entitlements. Prevents authenticated users
-- from self-upgrading their plan or exceeding per-plan QR limits via the Supabase
-- client. Run once in the Supabase SQL editor.
--
-- ROLE MODEL: only the untrusted client roles (authenticated, anon) are
-- restricted. service_role (Stripe webhook / admin client) and superuser contexts
-- (migrations, the SQL editor running as postgres) stay unrestricted — so backend
-- writes and manual admin fixes keep working.

-- ════════════════════════════════════════════════════════════════════════════
-- FIX 1 — Lock down billing / entitlement columns on profiles
-- ════════════════════════════════════════════════════════════════════════════

-- 1a. Ensure all protected columns exist (nullable; is_founding default false).
--     plan, stripe_customer_id, stripe_subscription_id already exist (001 / 004).
alter table public.profiles
  add column if not exists subscription_status    text,
  add column if not exists price_id               text,
  add column if not exists current_period_end     timestamptz,
  add column if not exists cancel_at_period_end    boolean,
  add column if not exists trial_end               timestamptz,
  add column if not exists is_founding             boolean not null default false;

-- Ad-hoc column the analytics page writes from the browser (authenticated). It
-- was never in a migration — formalize it here so the column-level GRANT below is
-- valid and that write keeps working.
alter table public.profiles
  add column if not exists last_seen_analytics_at  timestamptz;

comment on column public.profiles.is_founding is
  'Non-transferable founding-member flag. Service-role only. Founding revocation-on-lapse and the founding price lock are enforced later in the Stripe webhook layer (out of scope here).';

-- 1b. Layer 1 — BEFORE UPDATE trigger: reject protected-column changes from
--     authenticated/anon. SECURITY INVOKER so auth.role() reflects the caller.
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
  then
    raise exception 'Billing and entitlement fields are managed by the system and cannot be changed here.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_protect_profile_entitlements on public.profiles;
create trigger trg_protect_profile_entitlements
  before update on public.profiles
  for each row execute function public.protect_profile_entitlements();

-- 1c. Layer 2 — column privileges: revoke table-wide UPDATE from the client roles,
--     then grant UPDATE only on the user-editable columns.
revoke update on public.profiles from authenticated;
revoke update on public.profiles from anon;

grant update (
  name,
  phone,
  notify_showing,
  notify_question,
  notify_hot_lead,
  quiet_hours_start,
  quiet_hours_end,
  last_seen_analytics_at
) on public.profiles to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- FIX 2 — Server-enforced per-plan QR code limits
-- ════════════════════════════════════════════════════════════════════════════

-- 2a. ░░ PLAN → QR LIMIT MAP — EDIT HERE ░░  (return NULL for unlimited)
--     Proposed values, not final.
create or replace function public.qr_limit_for_plan(p text)
returns integer
language plpgsql
as $$
begin
  case p
    when 'founding' then return 10;
    when 'starter'  then return 3;
    when 'pro'      then return 10;
    when 'elite'    then return null;            -- unlimited
    else
      -- legacy / unknown plans (e.g. 'free', null) default safely; never lock out
      raise notice 'qr_limit_for_plan: unknown/legacy plan %, defaulting to 3', coalesce(p, '(null)');
      return 3;
  end case;
end;
$$;

-- 2b. BEFORE INSERT trigger on qrcodes. SECURITY DEFINER so the ownership join and
--     count see every row regardless of the caller's RLS.
--     Ownership path: qrcodes.property_id -> properties.id -> properties.user_id.
create or replace function public.enforce_qr_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_plan  text;
  v_limit integer;
  v_count integer;
begin
  -- Unlinked codes (null property) have no owner to attribute a limit to.
  if new.property_id is null then
    return new;
  end if;

  select p.user_id into v_owner
  from public.properties p
  where p.id = new.property_id;

  if v_owner is null then
    return new;  -- property ref unresolved; FK / RLS handle correctness
  end if;

  select plan into v_plan from public.profiles where id = v_owner;

  v_limit := public.qr_limit_for_plan(v_plan);
  if v_limit is null then
    return new;  -- unlimited plan
  end if;

  select count(*) into v_count
  from public.qrcodes q
  join public.properties p on p.id = q.property_id
  where p.user_id = v_owner;

  if v_count >= v_limit then
    raise exception 'QR code limit reached for your plan (% of % used).', v_count, v_limit
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_qr_limit on public.qrcodes;
create trigger trg_enforce_qr_limit
  before insert on public.qrcodes
  for each row execute function public.enforce_qr_limit();

-- ════════════════════════════════════════════════════════════════════════════
-- FIX 3 — Founding non-transferable flag
-- ════════════════════════════════════════════════════════════════════════════
-- is_founding is added (1a) and protected (1b trigger + 1c grant) above. Founding
-- revocation-on-lapse and the founding price lock are enforced later in the Stripe
-- webhook layer — intentionally NOT built here.
