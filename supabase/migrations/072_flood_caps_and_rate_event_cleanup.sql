-- 072 — Flood caps + 7-day cleanup of sms_rate_events
--
-- 1. sms_rate_events.agent_id: backs the "20 agent alert texts per agent per
--    hour" cap (lib/smsLimits.ts reserveAgentAlert). Nullable, no FK on purpose
--    (same as listing_id). Existing rows get NULL; no existing row is changed.
--    The new lead-form kinds ('lead_submission', 'lead_listing', 'agent_alert')
--    need no schema change: `kind` is free text.
--
-- 2. Retention: rows older than 7 days are deleted by the EXISTING daily job
--    (pg_cron 'retention-cleanup' -> select public.run_retention_cleanup()).
--    The 064 function is renamed untouched to run_retention_cleanup_core and a
--    thin wrapper with the original name and signature calls it, then deletes
--    old sms_rate_events. Nothing about scan_events, sms_consent_events,
--    retention_runs, sms_contacts or leads changes, and the cron job needs no
--    change. A dry run only counts what the new step would delete.
--
-- Applying this migration deletes nothing: rows only go when the job next runs.

alter table public.sms_rate_events add column if not exists agent_id uuid;

create index if not exists sms_rate_events_agent_idx
  on public.sms_rate_events (kind, agent_id, created_at) where agent_id is not null;

-- Needed so the 7-day purge doesn't scan the whole table.
create index if not exists sms_rate_events_created_idx
  on public.sms_rate_events (created_at);

do $$
begin
  if to_regprocedure('public.run_retention_cleanup_core(integer, integer, boolean)') is null then
    alter function public.run_retention_cleanup(integer, integer, boolean) rename to run_retention_cleanup_core;
  end if;
end $$;

revoke all on function public.run_retention_cleanup_core(integer, integer, boolean) from public, anon, authenticated;
grant execute on function public.run_retention_cleanup_core(integer, integer, boolean) to service_role;

create or replace function public.run_retention_cleanup(
  p_batch_size  integer default 5000,
  p_max_batches integer default 20,
  p_dry_run     boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result   jsonb := public.run_retention_cleanup_core(p_batch_size, p_max_batches, p_dry_run);
  v_batch    integer := greatest(1, least(coalesce(p_batch_size, 5000), 50000));
  v_max      integer := greatest(1, least(coalesce(p_max_batches, 20), 1000));
  v_cutoff   timestamptz := now() - interval '7 days';
  v_rate     integer := 0;
  v_n        integer;
  v_i        integer;
begin
  if p_dry_run then
    select count(*) into v_rate from public.sms_rate_events where created_at < v_cutoff;
  else
    for v_i in 1..v_max loop
      with victims as (
        select id from public.sms_rate_events
        where created_at < v_cutoff
        order by created_at
        limit v_batch
      ), deleted as (
        delete from public.sms_rate_events e using victims v where e.id = v.id returning 1
      )
      select count(*) into v_n from deleted;
      v_rate := v_rate + v_n;
      exit when v_n < v_batch;
    end loop;
  end if;
  return v_result || jsonb_build_object('sms_rate_events', v_rate);
end;
$$;

revoke all on function public.run_retention_cleanup(integer, integer, boolean) from public, anon, authenticated;
grant execute on function public.run_retention_cleanup(integer, integer, boolean) to service_role;
