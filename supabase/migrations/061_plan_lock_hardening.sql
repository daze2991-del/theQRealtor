-- 061 — Follow-ups to 060 (plan locking). No table data is read or changed
-- when this runs.
--
--   1. Revoke EXECUTE on the two SECURITY DEFINER trigger functions from 060
--      for public/anon/authenticated. The Supabase advisor flagged them as
--      callable via /rest/v1/rpc. Postgres refuses to run a trigger function
--      outside a trigger, so this is tidy-up, not a live hole. Triggers still
--      fire for every role: EXECUTE on a trigger function is checked when the
--      trigger is created, not when it fires.
--   2. Pin search_path on protect_profile_entitlements() (advisor:
--      function_search_path_mutable). ALTER only; the function body is
--      unchanged.
--   3. The unlock-on-upgrade trigger also fires on starter → pro, so items
--      still locked after free → starter unlock up to Pro's limits. The
--      function body is unchanged; it already unlocks up to plan_limits(new.plan).

-- ── 1. Trigger functions off the RPC surface ─────────────────────────────────
revoke all on function public.protect_property_plan_lock()   from public, anon, authenticated;
revoke all on function public.unlock_plan_locks_on_upgrade() from public, anon, authenticated;

-- ── 2. Fixed search_path ─────────────────────────────────────────────────────
alter function public.protect_profile_entitlements() set search_path = public;

-- ── 3. Unlock trigger: add starter → pro ─────────────────────────────────────
drop trigger if exists trg_unlock_plan_locks_on_upgrade on public.profiles;
create trigger trg_unlock_plan_locks_on_upgrade
  after update of plan on public.profiles
  for each row
  when (
    (old.plan in ('free', 'trial') and new.plan in ('starter', 'pro', 'founding', 'alpha'))
    or (old.plan = 'starter' and new.plan = 'pro')
  )
  execute function public.unlock_plan_locks_on_upgrade();
