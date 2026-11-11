-- 067 — Downgrade auto-fit: any move to a plan with a LOWER listing or sign
-- limit keeps the agent inside the new limits, then asks them to confirm.
--
-- Why: plan changes outside the end-of-trial chooser (a manual edit in
-- Supabase today; Stripe later) left agents over their limits, e.g. a Free
-- agent with 2/1 listings and 4/3 signs. Locking (migration 060) already
-- exists; nothing applied it on a downgrade.
--
-- What this adds:
--   1. profiles.plan_choice_required_at — set when a downgrade locked
--      something. The dashboard opens the "choose what stays active" screen
--      while it is set. Protected like the other entitlement fields.
--   2. plan_limits_lower(old, new) — true when the new plan's listing OR sign
--      limit is lower (null = no cap).
--   3. auto_fit_plan_limits(agent) — keeps the most active items up to the
--      agent's current plan limits and locks the rest. Same ranking as the
--      chooser (lib/planLock.ts rankByActivity): scans in the last 30 days,
--      then leads in the last 30 days, then latest activity in that window
--      (else created_at), then id. For signs, those whose current listing is
--      locked are locked first. Only ever LOCKS; never unlocks, never deletes.
--      founding/alpha: no-op.
--   4. trg_fit_plan_limits_on_downgrade on profiles.plan — fires only when
--      both the old and new plan are one of trial/starter/pro/free (so never
--      for founding/alpha in either direction, never for NULL or an
--      unrecognized value), the plan actually changed, and the new plan's
--      listing or sign limit is lower. Calls auto_fit_plan_limits and, if that
--      locked anything, sets plan_choice_required_at. Applies to every writer,
--      including manual edits in the Supabase dashboard.
--   5. apply_plan_selection(agent, listings[], signs[]) — the post-downgrade
--      choice, for any plan, with limits from plan_limits(). Only while
--      plan_choice_required_at is set. Never stamps the Free 30-day swap
--      clocks. Clears the flag.
--   6. apply_free_selection restated from 063 with one change (marked "067"):
--      it clears plan_choice_required_at. In 'choose' mode its own
--      plan = 'free' update fires the new trigger mid-function; the
--      function's selection is applied AFTER that, so the agent's choice
--      wins, and the flag the trigger set is cleared here.
--
-- Data: adds one empty column. No existing rows are read or changed when this
-- runs. Upgrades are unchanged (trg_unlock_plan_locks_on_upgrade, 060/061).
--
-- ROLLBACK (one script, in this order — the two function restores must run
-- BEFORE the column is dropped, or every profiles update would fail on the
-- missing column):
--   drop trigger  if exists trg_fit_plan_limits_on_downgrade on public.profiles;
--   drop function if exists public.fit_plan_limits_on_downgrade();
--   drop function if exists public.apply_plan_selection(uuid, uuid[], uuid[]);
--   drop function if exists public.auto_fit_plan_limits(uuid);
--   drop function if exists public.plan_limits_lower(text, text);
--   -- re-run the protect_profile_entitlements block of 062_free_swap_limit.sql
--   -- re-run the apply_free_selection block of 063_free_swap_limit_fix.sql
--   alter table public.profiles drop column if exists plan_choice_required_at;
-- Locks already stamped by the trigger stay in place after a rollback;
-- upgrading the agent (or a manual update of plan_locked_at) releases them.

-- ── 1. Flag column ───────────────────────────────────────────────────────────
alter table public.profiles add column if not exists plan_choice_required_at timestamptz;

comment on column public.profiles.plan_choice_required_at is
  'Set by trg_fit_plan_limits_on_downgrade when a downgrade locked listings or signs. While set, the dashboard asks the agent to confirm what stays active (apply_plan_selection clears it). Server/service-role only.';

-- ── 2. Protect from client writes ────────────────────────────────────────────
-- Same function as 062 plus plan_choice_required_at. SET search_path is
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
   or new.plan_choice_required_at is distinct from old.plan_choice_required_at  -- 067
  then
    raise exception 'Billing and entitlement fields are managed by the system and cannot be changed here.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$function$;

-- ── 3. Is the new plan's listing or sign limit lower? ────────────────────────
-- null limit = no cap, compared as "infinitely high".
create or replace function public.plan_limits_lower(p_old text, p_new text)
returns boolean
language sql immutable
set search_path = public
as $$
  select coalesce(n.max_listings, 2147483647) < coalesce(o.max_listings, 2147483647)
      or coalesce(n.max_signs,    2147483647) < coalesce(o.max_signs,    2147483647)
  from public.plan_limits(p_old) o, public.plan_limits(p_new) n
$$;

-- ── 4. Fit an agent to their current plan's limits ───────────────────────────
-- scan_events.created_at / leads.created_at are timestamp without time zone,
-- stored as UTC (lib/planLock.ts parseDbTime reads them the same way).
create or replace function public.auto_fit_plan_limits(p_agent uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_plan     text;
  v_max_l    int;
  v_max_s    int;
  v_now      timestamptz := now();
  v_since    timestamp   := (now() at time zone 'UTC') - interval '30 days';
  v_locked_l int := 0;
  v_locked_s int := 0;
begin
  select plan into v_plan from public.profiles where id = p_agent;
  if not found then
    return jsonb_build_object('skipped', 'no_profile', 'lockedListings', 0, 'lockedSigns', 0);
  end if;
  if v_plan in ('founding', 'alpha') then
    return jsonb_build_object('skipped', 'exempt', 'lockedListings', 0, 'lockedSigns', 0);
  end if;

  select max_listings, max_signs into v_max_l, v_max_s from public.plan_limits(v_plan);

  -- Listings: keep the top v_max_l counted listings, lock the rest.
  if v_max_l is not null then
    update public.properties set plan_locked_at = v_now
    where id in (
      select r.id from (
        select p.id,
               row_number() over (order by
                 (select count(*) from public.scan_events se where se.property_id = p.id and se.created_at >= v_since) desc,
                 (select count(*) from public.leads l        where l.property_id  = p.id and l.created_at  >= v_since) desc,
                 coalesce(greatest(
                   (select max(se.created_at) from public.scan_events se where se.property_id = p.id and se.created_at >= v_since) at time zone 'UTC',
                   (select max(l.created_at)  from public.leads l        where l.property_id  = p.id and l.created_at  >= v_since) at time zone 'UTC'),
                   p.created_at) desc nulls last,
                 p.id::text collate "C") as rn
        from public.properties p
        where p.user_id = p_agent and coalesce(p.active, false) and p.deleted_at is null and p.plan_locked_at is null
      ) r
      where r.rn > v_max_l);
    get diagnostics v_locked_l = row_count;
  end if;

  -- Signs: signs whose current listing is locked go last, then the same
  -- activity ranking. Runs after the listing step so it sees those locks.
  if v_max_s is not null then
    update public.signs set plan_locked_at = v_now
    where id in (
      select r.id from (
        select s.id,
               row_number() over (order by
                 exists (
                   select 1 from public.sign_assignments a
                   join public.properties p on p.id = a.property_id
                   where a.sign_id = s.id and a.unassigned_at is null and p.plan_locked_at is not null
                 ) asc,
                 (select count(*) from public.scan_events se where se.sign_id = s.id and se.created_at >= v_since) desc,
                 (select count(*) from public.leads l        where l.sign_id  = s.id and l.created_at  >= v_since) desc,
                 coalesce(greatest(
                   (select max(se.created_at) from public.scan_events se where se.sign_id = s.id and se.created_at >= v_since) at time zone 'UTC',
                   (select max(l.created_at)  from public.leads l        where l.sign_id  = s.id and l.created_at  >= v_since) at time zone 'UTC'),
                   s.created_at) desc nulls last,
                 s.id::text collate "C") as rn
        from public.signs s
        where s.agent_id = p_agent and s.archived_at is null and s.plan_locked_at is null
      ) r
      where r.rn > v_max_s);
    get diagnostics v_locked_s = row_count;
  end if;

  return jsonb_build_object('plan', v_plan, 'lockedListings', v_locked_l, 'lockedSigns', v_locked_s);
end;
$$;

-- ── 5. Trigger: fit on downgrade ─────────────────────────────────────────────
create or replace function public.fit_plan_limits_on_downgrade()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.plan_limits_lower(old.plan, new.plan) then
    return new;
  end if;

  v_result := public.auto_fit_plan_limits(new.id);

  if coalesce((v_result ->> 'lockedListings')::int, 0) + coalesce((v_result ->> 'lockedSigns')::int, 0) > 0 then
    update public.profiles set plan_choice_required_at = now() where id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_fit_plan_limits_on_downgrade on public.profiles;
create trigger trg_fit_plan_limits_on_downgrade
  after update of plan on public.profiles
  for each row
  when (
    old.plan is distinct from new.plan
    and old.plan in ('trial', 'starter', 'pro', 'free')
    and new.plan in ('trial', 'starter', 'pro', 'free')
  )
  execute function public.fit_plan_limits_on_downgrade();

-- ── 6. Post-downgrade choice (any plan) ──────────────────────────────────────
-- Same shape as apply_free_selection, but limits come from plan_limits(plan),
-- several listings are allowed, and the Free swap clocks are never touched.
-- A sign must be the agent's, not archived, and either unassigned or assigned
-- to one of the selected listings. Every other counted listing / sign is
-- locked; the selected ones are unlocked. Nothing is deleted.
create or replace function public.apply_plan_selection(
  p_agent    uuid,
  p_listings uuid[],
  p_signs    uuid[]
)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_plan     text;
  v_flag     timestamptz;
  v_max_l    int;
  v_max_s    int;
  v_listings uuid[];
  v_signs    uuid[];
  v_bad      int;
  v_now      timestamptz := now();
  v_locked_l int := 0;
  v_locked_s int := 0;
begin
  select plan, plan_choice_required_at into v_plan, v_flag
  from public.profiles where id = p_agent for update;
  if not found then raise exception 'no_profile'; end if;
  if v_plan in ('founding', 'alpha') then raise exception 'exempt_plan'; end if;
  if v_flag is null then raise exception 'no_choice_pending'; end if;

  select max_listings, max_signs into v_max_l, v_max_s from public.plan_limits(v_plan);

  select coalesce(array_agg(distinct x), '{}') into v_listings from unnest(coalesce(p_listings, '{}')) x where x is not null;
  select coalesce(array_agg(distinct x), '{}') into v_signs    from unnest(coalesce(p_signs,    '{}')) x where x is not null;
  if v_max_l is not null and cardinality(v_listings) > v_max_l then raise exception 'too_many_listings'; end if;
  if v_max_s is not null and cardinality(v_signs)    > v_max_s then raise exception 'too_many_signs';    end if;

  select count(*) into v_bad
  from unnest(v_listings) as lid
  where not exists (
    select 1 from public.properties
    where id = lid and user_id = p_agent and coalesce(active, false) and deleted_at is null
  );
  if v_bad > 0 then raise exception 'invalid_listing'; end if;

  select count(*) into v_bad
  from unnest(v_signs) as sid
  where not exists (
    select 1 from public.signs s
    where s.id = sid and s.agent_id = p_agent and s.archived_at is null
      and not exists (
        select 1 from public.sign_assignments a
        where a.sign_id = s.id and a.unassigned_at is null
          and a.property_id is not null and not (a.property_id = any(v_listings))
      )
  );
  if v_bad > 0 then raise exception 'invalid_sign'; end if;

  update public.properties set plan_locked_at = null
  where user_id = p_agent and id = any(v_listings) and plan_locked_at is not null;

  if v_max_l is not null then
    update public.properties set plan_locked_at = v_now
    where user_id = p_agent and coalesce(active, false) and deleted_at is null
      and plan_locked_at is null and not (id = any(v_listings));
    get diagnostics v_locked_l = row_count;
  end if;

  update public.signs set plan_locked_at = null
  where agent_id = p_agent and id = any(v_signs) and plan_locked_at is not null;

  if v_max_s is not null then
    update public.signs set plan_locked_at = v_now
    where agent_id = p_agent and archived_at is null
      and plan_locked_at is null and not (id = any(v_signs));
    get diagnostics v_locked_s = row_count;
  end if;

  update public.profiles set plan_choice_required_at = null where id = p_agent;

  return jsonb_build_object('plan', v_plan, 'newlyLockedListings', v_locked_l, 'newlyLockedSigns', v_locked_s);
end;
$$;

-- ── 7. apply_free_selection: identical to 063 except the line marked "067" ───
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
    elsif v_cur_listing is not null then
      -- 063: signs-only change on the SAME live listing. With no live listing
      -- (it sold / went offline) the agent is choosing a new listing, and the
      -- old listing's signs leaving is part of that, not a sign swap.
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

  -- 067: a choice was made; clear the downgrade flag (set by the trigger when
  -- the 'choose' update above moved trial → free).
  update public.profiles set plan_choice_required_at = null where id = p_agent and plan_choice_required_at is not null;

  return jsonb_build_object(
    'plan', 'free',
    'newlyLockedListings', v_locked_l,
    'newlyLockedSigns', v_locked_s,
    'listingChangeCounted', v_listing_change,
    'signChangeCounted', v_sign_change);
end;
$$;

-- ── 8. Grants: service_role only; trigger functions off the RPC surface ──────
revoke all on function public.plan_limits_lower(text, text)                 from public, anon, authenticated;
revoke all on function public.auto_fit_plan_limits(uuid)                    from public, anon, authenticated;
revoke all on function public.fit_plan_limits_on_downgrade()                from public, anon, authenticated;
revoke all on function public.apply_plan_selection(uuid, uuid[], uuid[])    from public, anon, authenticated;
revoke all on function public.apply_free_selection(uuid, text, uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.plan_limits_lower(text, text)                 to service_role;
grant execute on function public.auto_fit_plan_limits(uuid)                    to service_role;
grant execute on function public.apply_plan_selection(uuid, uuid[], uuid[])    to service_role;
grant execute on function public.apply_free_selection(uuid, text, uuid, uuid[]) to service_role;
