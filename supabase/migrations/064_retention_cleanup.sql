-- 064 — Automated data-retention cleanup, matching the Privacy Policy
-- (app/privacy, section 5 "How long we keep it"):
--
--   • Anonymous visit records — scan_events rows with converted = false (no
--     buyer request attached) — deleted after 24 months.
--   • Text consent / opt-out HISTORY (sms_consent_events) — deleted after 5
--     years, EXCEPT the newest row for each phone, which is kept for as long
--     as needed to honor it.
--   • Leads: not touched (kept while the agent's account is open).
--   • sms_contacts (current opt-out state; the ONLY thing sendSmsDetailed's
--     suppression check reads): not touched, ever.
--
-- Pieces:
--   1. pg_cron (free, built into Supabase) for the daily schedule.
--   2. Partial index so batched scan deletes don't scan the whole table.
--   3. scan_event_rollups — monthly per-listing/per-sign COUNTS (no personal
--      data), written in the same transaction right before scans are deleted,
--      so lifetime totals can always be rebuilt.
--      TODO (before Aug 2028, when the first scans become 24 months old):
--      point the lifetime-total screens at scan_events + scan_event_rollups —
--      Properties list "Scans", property detail all-time count, lead detail
--      listing scan count, seller report total scans + unique visits, and
--      dashboard totals. Until then nothing has been deleted, so they're exact.
--   4. retention_runs — one log row per run (counts + timing only).
--      Prunes itself after 2 years.
--   5. sms_consent_events append-only trigger: one narrow DELETE exception.
--   6. run_retention_cleanup() — SECURITY DEFINER, bounded batches,
--      idempotent, optional dry run. Also prunes cron.job_run_details > 30 days.
--   7. Daily schedule, 10:00 UTC.
--
-- Applying this migration deletes nothing. Deletes only happen when the
-- function runs, and only for rows matching the rules above.

-- ── 1. pg_cron ───────────────────────────────────────────────────────────────
create extension if not exists pg_cron;

-- ── 2. Index for the anonymous-scan delete ───────────────────────────────────
create index if not exists scan_events_anonymous_created_at_idx
  on public.scan_events (created_at)
  where not converted;

-- ── 3. Rollups (counts only) ─────────────────────────────────────────────────
-- No foreign keys on purpose: these are historical counts keyed by id, like
-- scan_events.property_id. A SET NULL FK could collide with the unique key
-- if a listing were ever hard-deleted; orphaned ids in a count table are
-- harmless.
create table if not exists public.scan_event_rollups (
  property_id  uuid,
  sign_id      uuid,
  month        date        not null,
  scans        integer     not null default 0,
  first_visits integer     not null default 0,  -- rows with return_visit = false
  updated_at   timestamptz not null default now(),
  constraint scan_event_rollups_key unique nulls not distinct (property_id, sign_id, month)
);

comment on table public.scan_event_rollups is
  'Monthly scan counts preserved by run_retention_cleanup() before anonymous scan_events rows are deleted (24-month retention). Counts only — no personal data.';

alter table public.scan_event_rollups enable row level security;
revoke all on public.scan_event_rollups from public, anon, authenticated;
grant select on public.scan_event_rollups to service_role;

-- ── 4. Run log (no personal data) ────────────────────────────────────────────
create table if not exists public.retention_runs (
  id                     bigint generated always as identity primary key,
  ran_at                 timestamptz not null default now(),
  dry_run                boolean     not null,
  -- In a dry run these are "would delete" counts.
  scans_deleted          integer     not null default 0,
  scans_rolled_up        integer     not null default 0,
  consent_events_deleted integer     not null default 0,
  cron_history_pruned    integer     not null default 0,
  runs_pruned            integer     not null default 0,
  more_remaining         boolean     not null default false,
  duration_ms            integer     not null default 0
);

comment on table public.retention_runs is
  'One row per run_retention_cleanup() call: counts and timing only. Rows older than 2 years are pruned by the function itself.';

alter table public.retention_runs enable row level security;
revoke all on public.retention_runs from public, anon, authenticated;
grant select on public.retention_runs to service_role;

-- ── 5. sms_consent_events: one narrow DELETE exception ───────────────────────
-- Unchanged from before except the DELETE branch. A DELETE now succeeds only
-- when ALL of these hold (otherwise it raises exactly as before):
--   • the transaction-local flag app.retention_purge = 'on' (set only by
--     run_retention_cleanup)
--   • the row is older than 5 years
--   • a NEWER row exists for the same phone — so the latest row per phone can
--     never be deleted, at any age
-- TRUNCATE stays blocked. UPDATE rules are unchanged. service_role still has
-- no DELETE grant on this table (only INSERT, SELECT).
create or replace function public.sms_consent_events_append_only()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
begin
  if tg_op = 'DELETE' then
    if coalesce(current_setting('app.retention_purge', true), '') = 'on'
       and old.received_at < now() - interval '5 years'
       and exists (
         select 1 from public.sms_consent_events n
         where n.phone_e164 = old.phone_e164
           and (n.received_at > old.received_at
                or (n.received_at = old.received_at and n.id > old.id))
       )
    then
      return old;
    end if;
    raise exception 'sms_consent_events is append-only: DELETE is not permitted';
  elsif tg_op = 'TRUNCATE' then
    raise exception 'sms_consent_events is append-only: TRUNCATE is not permitted';
  end if;

  if (to_jsonb(new) - 'lead_id' - 'agent_id') is distinct from (to_jsonb(old) - 'lead_id' - 'agent_id')
     or (new.lead_id  is not null and new.lead_id  is distinct from old.lead_id)
     or (new.agent_id is not null and new.agent_id is distinct from old.agent_id)
     or pg_trigger_depth() < 2
  then
    raise exception 'sms_consent_events is append-only: UPDATE is not permitted (only an FK ON DELETE SET NULL of lead_id/agent_id is allowed)';
  end if;

  return new;
end;
$function$;

-- ── 6. The cleanup ───────────────────────────────────────────────────────────
-- Each call is one transaction, bounded to p_max_batches × p_batch_size rows
-- per table; anything left over is picked up by the next daily run
-- (more_remaining = true in the log). Rules are criteria-based, so re-running
-- deletes nothing new (idempotent). Applies to every account alike.
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
  v_started         timestamptz := clock_timestamp();
  -- scan_events.created_at is timestamp WITHOUT time zone, stored as UTC.
  v_scan_cutoff     timestamp   := (now() at time zone 'utc') - interval '24 months';
  v_consent_cutoff  timestamptz := now() - interval '5 years';
  v_batch           integer     := greatest(1, least(coalesce(p_batch_size, 5000), 50000));
  v_max_batches     integer     := greatest(1, least(coalesce(p_max_batches, 20), 1000));
  v_i               integer;
  v_n               integer;
  v_scans           integer := 0;
  v_rolled          integer := 0;
  v_consent         integer := 0;
  v_cron            integer := 0;
  v_runs            integer := 0;
  v_more            boolean := false;
begin
  if p_dry_run then
    select count(*) into v_scans
    from public.scan_events
    where not converted and created_at < v_scan_cutoff;
    v_rolled := v_scans;

    select count(*) into v_consent
    from (
      select received_at,
             row_number() over (partition by phone_e164 order by received_at desc, id desc) as rn
      from public.sms_consent_events
    ) r
    where r.rn > 1 and r.received_at < v_consent_cutoff;

    select count(*) into v_cron from cron.job_run_details where start_time < now() - interval '30 days';
    select count(*) into v_runs from public.retention_runs where ran_at < now() - interval '2 years';
  else
    -- Anonymous scans: roll up, then delete, batch by batch.
    for v_i in 1..v_max_batches loop
      with batch as (
        select id, property_id, sign_id, created_at, return_visit
        from public.scan_events
        where not converted and created_at < v_scan_cutoff
        order by created_at, id
        limit v_batch
        for update skip locked
      ), rolled as (
        insert into public.scan_event_rollups as r (property_id, sign_id, month, scans, first_visits)
        select property_id, sign_id, date_trunc('month', created_at)::date,
               count(*), count(*) filter (where not return_visit)
        from batch
        group by 1, 2, 3
        on conflict on constraint scan_event_rollups_key do update
          set scans        = r.scans + excluded.scans,
              first_visits = r.first_visits + excluded.first_visits,
              updated_at   = now()
        returning 1
      ), deleted as (
        delete from public.scan_events s
        using batch b
        where s.id = b.id
        returning 1
      )
      select count(*) into v_n from deleted;
      v_scans  := v_scans + v_n;
      v_rolled := v_rolled + v_n;
      exit when v_n < v_batch;
    end loop;

    -- Superseded consent history older than 5 years (never the newest row
    -- per phone; the trigger enforces the same rule independently).
    perform set_config('app.retention_purge', 'on', true);
    for v_i in 1..v_max_batches loop
      with ranked as (
        select id, received_at,
               row_number() over (partition by phone_e164 order by received_at desc, id desc) as rn
        from public.sms_consent_events
      ), victims as (
        select id from ranked
        where rn > 1 and received_at < v_consent_cutoff
        order by received_at, id
        limit v_batch
      ), deleted as (
        delete from public.sms_consent_events e
        using victims v
        where e.id = v.id
        returning 1
      )
      select count(*) into v_n from deleted;
      v_consent := v_consent + v_n;
      exit when v_n < v_batch;
    end loop;
    perform set_config('app.retention_purge', 'off', true);

    -- Housekeeping: cron history > 30 days, own log > 2 years.
    delete from cron.job_run_details where start_time < now() - interval '30 days';
    get diagnostics v_cron = row_count;
    delete from public.retention_runs where ran_at < now() - interval '2 years';
    get diagnostics v_runs = row_count;
  end if;

  -- In a real run: rows still eligible after this run's bounded batches.
  -- In a dry run: whether anything is eligible at all.
  v_more := exists (
              select 1 from public.scan_events
              where not converted and created_at < v_scan_cutoff)
         or exists (
              select 1 from (
                select received_at,
                       row_number() over (partition by phone_e164 order by received_at desc, id desc) as rn
                from public.sms_consent_events
              ) r
              where r.rn > 1 and r.received_at < v_consent_cutoff);

  insert into public.retention_runs
    (dry_run, scans_deleted, scans_rolled_up, consent_events_deleted, cron_history_pruned, runs_pruned, more_remaining, duration_ms)
  values
    (p_dry_run, v_scans, v_rolled, v_consent, v_cron, v_runs, v_more,
     (extract(epoch from clock_timestamp() - v_started) * 1000)::integer);

  return jsonb_build_object(
    'dry_run',             p_dry_run,
    'scans',               v_scans,
    'scans_rolled_up',     v_rolled,
    'consent_events',      v_consent,
    'cron_history_pruned', v_cron,
    'runs_pruned',         v_runs,
    'more_remaining',      v_more);
end;
$$;

revoke all on function public.run_retention_cleanup(integer, integer, boolean) from public, anon, authenticated;
grant execute on function public.run_retention_cleanup(integer, integer, boolean) to service_role;

-- ── 7. Daily schedule (10:00 UTC ≈ 3am Pacific) ──────────────────────────────
-- cron.schedule with an existing job name updates that job, so re-running
-- this migration doesn't create a duplicate.
select cron.schedule('retention-cleanup', '0 10 * * *', $cron$select public.run_retention_cleanup()$cron$);
