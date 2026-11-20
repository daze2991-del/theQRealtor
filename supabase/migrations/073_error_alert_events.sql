-- 073 — Error-alert throttle ledger (lib/errorAlerts.ts)
--
-- One row per error-alert ATTEMPT, written before the email is sent so that
-- concurrent errors see each other and can only over-throttle, never over-send:
--   • at most one email per fingerprint per hour
--   • at most 20 alert emails per rolling 24 hours, all errors combined
-- A refused attempt is flipped to allowed=false and stops counting.
--
--   fingerprint  sha256 prefix of (route + scrubbed message) — one-way
--   route        route TEMPLATE only (e.g. /api/report/[token]); never a real URL
--
-- No error message, name, phone, email or token is stored here.
-- Service-role only: RLS on with no policies, nothing granted to anon or
-- authenticated. Creates an empty table: changes no existing rows.

create table if not exists public.error_alert_events (
  id          uuid        primary key default gen_random_uuid(),
  fingerprint text        not null,
  route       text        not null,
  allowed     boolean     not null default true,
  created_at  timestamptz not null default now()
);

alter table public.error_alert_events enable row level security;

revoke all on public.error_alert_events from anon, authenticated;
grant select, insert, update on public.error_alert_events to service_role;

create index if not exists error_alert_events_fp_idx
  on public.error_alert_events (fingerprint, created_at);
create index if not exists error_alert_events_created_idx
  on public.error_alert_events (created_at);

-- Retention: the daily job (migration 072's wrapper) also prunes this table at
-- 7 days. The wrapper is re-created with the SAME sms_rate_events step as 072
-- plus one more step; the renamed 064 core function is still untouched.
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
  v_alerts   integer := 0;
  v_n        integer;
  v_i        integer;
begin
  if p_dry_run then
    select count(*) into v_rate   from public.sms_rate_events   where created_at < v_cutoff;
    select count(*) into v_alerts from public.error_alert_events where created_at < v_cutoff;
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

    for v_i in 1..v_max loop
      with victims as (
        select id from public.error_alert_events
        where created_at < v_cutoff
        order by created_at
        limit v_batch
      ), deleted as (
        delete from public.error_alert_events e using victims v where e.id = v.id returning 1
      )
      select count(*) into v_n from deleted;
      v_alerts := v_alerts + v_n;
      exit when v_n < v_batch;
    end loop;
  end if;
  return v_result || jsonb_build_object('sms_rate_events', v_rate, 'error_alert_events', v_alerts);
end;
$$;

revoke all on function public.run_retention_cleanup(integer, integer, boolean) from public, anon, authenticated;
grant execute on function public.run_retention_cleanup(integer, integer, boolean) to service_role;
