-- 062 — Free swap limit: at most one listing change and one sign change per
-- 30 days.
--
-- A Free agent changes what's active through apply_free_selection(.., 'swap').
-- A change COUNTS (needs the 30-day clock and restarts it) only when it takes
-- something out of use that is currently in use:
--   • Listing change: the currently active listing (not locked, live, not
--     deleted) is replaced by a different listing, or by none.
--     Clock: profiles.free_listing_swapped_at.
--   • Sign change (same listing): a currently active sign (not locked, not
--     archived) is dropped. Clock: profiles.free_signs_swapped_at.
-- That gives the spec's exceptions without special cases:
--   • The active listing went offline or was deleted (e.g. it sold) → nothing
--     live is being replaced → allowed immediately, and the clock is not
--     restarted.
--   • A selected sign was archived → it's no longer in use, so picking a
--     replacement is allowed immediately. Filling an empty sign slot never
--     counts either.
-- The initial Free choice (mode 'choose') never checks or stamps either
-- clock. Re-sending the same selection changes nothing and stamps nothing.
--
-- Data: adds two empty columns to profiles; no existing rows are changed.

-- ── 1. Clock columns ─────────────────────────────────────────────────────────
alter table public.profiles add column if not exists free_listing_swapped_at timestamptz;
alter table public.profiles add column if not exists free_signs_swapped_at   timestamptz;

comment on column public.profiles.free_listing_swapped_at is
  'Last counted change of the active listing on Free (apply_free_selection swap). Next change allowed 30 days later unless the active listing is no longer live. Server/service-role only.';
comment on column public.profiles.free_signs_swapped_at is
  'Last counted change of active signs on the same listing on Free. Next replacement allowed 30 days later; filling an empty slot is always allowed. Server/service-role only.';

-- ── 2. Protect from client writes ────────────────────────────────────────────
-- Same function as 059/061 plus the two new columns. SET search_path is
-- restated because CREATE OR REPLACE resets function settings.
create or replace function public.protect_profile_entitlements()
 returns trigger
 language plpgsql
 set search_path = public
as $function$
begin
  if auth.role() is distinct from 'authenticated'
     and auth.role() is distinct from 'anon' then
    return new;
  end if;

  if  new.plan                    is distinct from old.plan
   or new.subscription_status     is distinct from old.subscription_status
   or new.price_id                is distinct from old.price_id
   or new.stripe_customer_id      is distinct from old.stripe_customer_id
   or new.stripe_subscription_id  is distinct from old.stripe_subscription_id
   or new.current_period_end      is distinct from old.current_period_end
   or new.cancel_at_period_end    is distinct from old.cancel_at_period_end
   or new.trial_end               is distinct from old.trial_end
   or new.is_founding             is distinct from old.is_founding
   or new.cancel_at               is distinct from old.cancel_at
   or new.cancellation_reason     is distinct from old.cancellation_reason
   or new.last_payment_failed_at  is distinct from old.last_payment_failed_at
   or new.account_status          is distinct from old.account_status
   or new.billing_interval        is distinct from old.billing_interval
   or new.free_listing_swapped_at is distinct from old.free_listing_swapped_at
   or new.free_signs_swapped_at   is distinct from old.free_signs_swapped_at
  then
    raise exception 'Billing and entitlement fields are managed by the system and cannot be changed here.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$function$;

-- ── 3. When can this agent next change? (for the dashboard) ──────────────────
-- NULL = allowed now. signs_next_at is when a REPLACEMENT is allowed; filling
-- an empty slot is always allowed.
create or replace function public.free_swap_availability(
  p_agent uuid,
  out listing_next_at timestamptz,
  out signs_next_at   timestamptz
)
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_l timestamptz;
  v_s timestamptz;
begin
  select free_listing_swapped_at, free_signs_swapped_at into v_l, v_s
  from public.profiles where id = p_agent;

  listing_next_at := case
    when v_l is not null and v_l + interval '30 days' > now()
     and exists (select 1 from public.properties
                 where user_id = p_agent and plan_locked_at is null
                   and coalesce(active, false) and deleted_at is null)
    then v_l + interval '30 days' end;

  signs_next_at := case
    when v_s is not null and v_s + interval '30 days' > now()
    then v_s + interval '30 days' end;
end;
$$;

revoke all on function public.free_swap_availability(uuid) from public, anon, authenticated;
grant execute on function public.free_swap_availability(uuid) to service_role;

-- ── 4. apply_free_selection: enforce and stamp the clocks in swap mode ───────
-- Identical to 060 except the blocks marked "062".
create or replace function public.apply_free_selection(
  p_agent   uuid,
  p_mode    text,
  p_listing uuid,
  p_signs   uuid[]
)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_plan      text;
  v_signs     uuid[];
  v_bad       int;
  v_now       timestamptz := now();
  v_locked_l  int;
  v_locked_s  int;
  -- 062
  v_last_l         timestamptz;
  v_last_s         timestamptz;
  v_cur_listing    uuid;
  v_listing_change boolean := false;
  v_sign_change    boolean := false;
begin
  if p_mode is null or p_mode not in ('choose', 'swap') then
    raise exception 'invalid_mode';
  end if;

  select plan, free_listing_swapped_at, free_signs_swapped_at
    into v_plan, v_last_l, v_last_s
  from public.profiles where id = p_agent for update;
  if not found then raise exception 'no_profile'; end if;
  if p_mode = 'choose' and v_plan is distinct from 'trial' then raise exception 'not_trial'; end if;
  if p_mode = 'swap'   and v_plan is distinct from 'free'  then raise exception 'not_free';  end if;

  select coalesce(array_agg(distinct s), '{}') into v_signs from unnest(coalesce(p_signs, '{}')) s;
  if cardinality(v_signs) > 3 then raise exception 'too_many_signs'; end if;

  if p_listing is not null and not exists (
    select 1 from public.properties
    where id = p_listing and user_id = p_agent and coalesce(active, false) and deleted_at is null
  ) then
    raise exception 'invalid_listing';
  end if;

  select count(*) into v_bad
  from unnest(v_signs) as sid
  where not exists (
    select 1 from public.signs s
    where s.id = sid and s.agent_id = p_agent and s.archived_at is null
      and not exists (
        select 1 from public.sign_assignments a
        where a.sign_id = s.id and a.unassigned_at is null
          and a.property_id is not null and a.property_id is distinct from p_listing
      )
  );
  if v_bad > 0 then raise exception 'invalid_sign'; end if;

  -- 062: 30-day swap limit (swap mode only; the first Free choice is exempt).
  -- Refusal message: 'swap_too_soon:<ISO-8601 UTC time of next allowed change>'.
  if p_mode = 'swap' then
    select id into v_cur_listing
    from public.properties
    where user_id = p_agent and plan_locked_at is null
      and coalesce(active, false) and deleted_at is null
    order by created_at, id
    limit 1;

    v_listing_change := v_cur_listing is not null and v_cur_listing is distinct from p_listing;

    if v_listing_change then
      if v_last_l is not null and v_last_l + interval '30 days' > v_now then
        raise exception 'swap_too_soon:%',
          to_char((v_last_l + interval '30 days') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
      end if;
    else
      v_sign_change := exists (
        select 1 from public.signs
        where agent_id = p_agent and archived_at is null and plan_locked_at is null
          and not (id = any(v_signs))
      );
      if v_sign_change and v_last_s is not null and v_last_s + interval '30 days' > v_now then
        raise exception 'swap_too_soon:%',
          to_char((v_last_s + interval '30 days') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
      end if;
    end if;
  end if;

  if p_mode = 'choose' then
    update public.profiles set plan = 'free' where id = p_agent;
  end if;

  update public.properties set plan_locked_at = null
  where user_id = p_agent and id = p_listing and plan_locked_at is not null;

  update public.properties set plan_locked_at = v_now
  where user_id = p_agent and coalesce(active, false) and deleted_at is null
    and plan_locked_at is null and id is distinct from p_listing;
  get diagnostics v_locked_l = row_count;

  update public.signs set plan_locked_at = null
  where agent_id = p_agent and id = any(v_signs) and plan_locked_at is not null;

  update public.signs set plan_locked_at = v_now
  where agent_id = p_agent and archived_at is null
    and plan_locked_at is null and not (id = any(v_signs));
  get diagnostics v_locked_s = row_count;

  -- 062: restart the clock only for a change that counted.
  if v_listing_change then
    update public.profiles set free_listing_swapped_at = v_now where id = p_agent;
  elsif v_sign_change then
    update public.profiles set free_signs_swapped_at = v_now where id = p_agent;
  end if;

  return jsonb_build_object(
    'plan', 'free',
    'newlyLockedListings', v_locked_l,
    'newlyLockedSigns', v_locked_s,
    'listingChangeCounted', v_listing_change,
    'signChangeCounted', v_sign_change);
end;
$$;

revoke all on function public.apply_free_selection(uuid, text, uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.apply_free_selection(uuid, text, uuid, uuid[]) to service_role;
