-- 060 — Plan locking: end-of-trial chooser, Free selection, unlock on upgrade.
--
-- A "locked" listing or sign keeps all of its data and history, but buyers
-- can't send requests through it (enforced in app code via lib/planLock.ts).
-- Locked items don't count toward plan limits.
--
--   1. properties.plan_locked_at / signs.plan_locked_at. These are separate from
--      properties.active (the agent's own offline toggle), properties.deleted_at
--      and signs.archived_at.
--   2. plan_limits(plan): a SQL mirror of the limits in lib/plans.ts.
--      tests/plan-locking.test.ts fails if the two drift.
--   3. Protect triggers: an authenticated/anon caller can't set or clear
--      plan_locked_at. Same auth.role() bypass and errcode (42501) as
--      protect_profile_entitlements. On properties it also refuses turning a
--      listing back on when the plan's listing limit is already used up.
--   4. apply_free_selection(): the Free choice and the Free swap, atomic,
--      service_role only.
--   5. On an upgrade out of free/trial, an AFTER UPDATE trigger on profiles.plan
--      unlocks items up to the new plan's limits, so a manual edit in Supabase
--      works too.
--
-- An expired trial with no choice yet is NOT stamped here: lib/planLock.ts
-- computes that lock from the trial clock.

-- ── 1. Columns ───────────────────────────────────────────────────────────────
alter table public.properties add column if not exists plan_locked_at timestamptz;
alter table public.signs      add column if not exists plan_locked_at timestamptz;

comment on column public.properties.plan_locked_at is
  'Set by the system when this listing is outside the agent''s plan (e.g. not chosen on Free). Buyers cannot send requests while set. Does not count toward plan limits. Server/service-role only.';
comment on column public.signs.plan_locked_at is
  'Set by the system when this sign is outside the agent''s plan (e.g. not chosen on Free). Buyers cannot send requests through it while set. Does not count toward plan limits. Server/service-role only.';

-- ── 2. Plan limits (mirror of PLAN_CONFIG in lib/plans.ts) ───────────────────
-- Unknown/null plans fall back to free, like planConfig(). null = no cap.
create or replace function public.plan_limits(p_plan text, out max_listings int, out max_signs int)
language plpgsql immutable
set search_path = public
as $$
begin
  case p_plan
    when 'founding' then max_listings := null; max_signs := 10;
    when 'alpha'    then max_listings := null; max_signs := 10;
    when 'trial'    then max_listings := 3;    max_signs := 15;
    when 'starter'  then max_listings := 3;    max_signs := 15;
    when 'pro'      then max_listings := null; max_signs := 50;
    else                 max_listings := 1;    max_signs := 3;   -- free + unknown
  end case;
end;
$$;

-- ── 3. Protect triggers ──────────────────────────────────────────────────────
create or replace function public.protect_property_plan_lock()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_plan  text;
  v_limit int;
  v_count int;
begin
  if auth.role() is distinct from 'authenticated'
     and auth.role() is distinct from 'anon' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.plan_locked_at is not null then
      raise exception 'Plan lock is managed by the system and cannot be changed here.'
        using errcode = 'insufficient_privilege';
    end if;
    return new;
  end if;

  if new.plan_locked_at is distinct from old.plan_locked_at then
    raise exception 'Plan lock is managed by the system and cannot be changed here.'
      using errcode = 'insufficient_privilege';
  end if;

  -- Reactivation limit: a listing that starts counting toward the plan
  -- (turned back on, or un-deleted) must fit the plan's listing limit.
  if coalesce(new.active, false) and new.deleted_at is null and new.plan_locked_at is null
     and not (coalesce(old.active, false) and old.deleted_at is null and old.plan_locked_at is null) then
    select plan into v_plan from public.profiles where id = new.user_id;
    select max_listings into v_limit from public.plan_limits(v_plan);
    if v_limit is not null then
      select count(*) into v_count
      from public.properties
      where user_id = new.user_id and id <> new.id
        and coalesce(active, false) and deleted_at is null and plan_locked_at is null;
      if v_count >= v_limit then
        raise exception '%', format(
          'Your plan allows up to %s active listing%s. Take another listing offline first.',
          v_limit, case when v_limit = 1 then '' else 's' end)
          using errcode = 'insufficient_privilege';
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_protect_property_plan_lock on public.properties;
create trigger trg_protect_property_plan_lock
  before insert or update on public.properties
  for each row execute function public.protect_property_plan_lock();

create or replace function public.protect_sign_plan_lock()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.role() is distinct from 'authenticated'
     and auth.role() is distinct from 'anon' then
    return new;
  end if;

  if (tg_op = 'INSERT' and new.plan_locked_at is not null)
     or (tg_op = 'UPDATE' and new.plan_locked_at is distinct from old.plan_locked_at) then
    raise exception 'Plan lock is managed by the system and cannot be changed here.'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_sign_plan_lock on public.signs;
create trigger trg_protect_sign_plan_lock
  before insert or update on public.signs
  for each row execute function public.protect_sign_plan_lock();

-- ── 4. Free selection (choose on expired trial, or swap while on Free) ───────
-- p_mode 'choose': plan must be 'trial'. The 45-day expiry is checked by the
--                  calling route (TRIAL_DAYS lives in lib/trial.ts). Sets plan = 'free'.
-- p_mode 'swap':   plan must be 'free'.
-- Either way: at most 1 listing (the single uuid) and 3 signs. Each selected
-- sign must be the agent's, not archived, and either assigned to the selected
-- listing or unassigned. Every OTHER active listing and active sign is locked;
-- the selected ones are unlocked. Archived signs and offline/deleted listings
-- are never touched. Nothing is deleted. Re-running with the same selection
-- changes nothing.
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
begin
  if p_mode is null or p_mode not in ('choose', 'swap') then
    raise exception 'invalid_mode';
  end if;

  select plan into v_plan from public.profiles where id = p_agent for update;
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

  return jsonb_build_object('plan', 'free', 'newlyLockedListings', v_locked_l, 'newlyLockedSigns', v_locked_s);
end;
$$;

revoke all on function public.apply_free_selection(uuid, text, uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.apply_free_selection(uuid, text, uuid, uuid[]) to service_role;

-- ── 5. Unlock on upgrade ─────────────────────────────────────────────────────
-- Fires when plan moves from free/trial to starter, pro, founding or alpha,
-- by any path (server route, webhook, manual Supabase edit).
-- Locked items that don't use a slot (offline/deleted listings, archived
-- signs) unlock unconditionally. Turning them back on is limit-checked
-- anyway (trigger above / app/api/signs/[signId]). Items that DO use a slot
-- unlock most-recently-active first, until the new plan's limit is reached.
create or replace function public.unlock_plan_locks_on_upgrade()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_max_l int;
  v_max_s int;
  v_slots int;
begin
  select max_listings, max_signs into v_max_l, v_max_s from public.plan_limits(new.plan);

  -- Listings
  update public.properties set plan_locked_at = null
  where user_id = new.id and plan_locked_at is not null
    and not (coalesce(active, false) and deleted_at is null);

  if v_max_l is null then
    update public.properties set plan_locked_at = null
    where user_id = new.id and plan_locked_at is not null;
  else
    v_slots := v_max_l - (
      select count(*) from public.properties
      where user_id = new.id and coalesce(active, false) and deleted_at is null and plan_locked_at is null);
    if v_slots > 0 then
      update public.properties set plan_locked_at = null
      where id in (
        select p.id from public.properties p
        where p.user_id = new.id and p.plan_locked_at is not null
        order by greatest(
          (select max(se.created_at)::timestamptz from public.scan_events se where se.property_id = p.id),
          (select max(l.created_at)::timestamptz  from public.leads l       where l.property_id  = p.id),
          p.created_at) desc nulls last, p.id
        limit v_slots);
    end if;
  end if;

  -- Signs
  update public.signs set plan_locked_at = null
  where agent_id = new.id and plan_locked_at is not null and archived_at is not null;

  if v_max_s is null then
    update public.signs set plan_locked_at = null
    where agent_id = new.id and plan_locked_at is not null;
  else
    v_slots := v_max_s - (
      select count(*) from public.signs
      where agent_id = new.id and archived_at is null and plan_locked_at is null);
    if v_slots > 0 then
      update public.signs set plan_locked_at = null
      where id in (
        select s.id from public.signs s
        where s.agent_id = new.id and s.plan_locked_at is not null
        order by greatest(
          (select max(se.created_at)::timestamptz from public.scan_events se where se.sign_id = s.id),
          (select max(l.created_at)::timestamptz  from public.leads l       where l.sign_id  = s.id),
          s.created_at) desc nulls last, s.id
        limit v_slots);
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_unlock_plan_locks_on_upgrade on public.profiles;
create trigger trg_unlock_plan_locks_on_upgrade
  after update of plan on public.profiles
  for each row
  when (old.plan in ('free', 'trial') and new.plan in ('starter', 'pro', 'founding', 'alpha'))
  execute function public.unlock_plan_locks_on_upgrade();

-- Helpers stay off the public RPC surface. The triggers run them as the
-- function owner.
revoke all on function public.plan_limits(text) from public, anon, authenticated;
grant execute on function public.plan_limits(text) to service_role;
