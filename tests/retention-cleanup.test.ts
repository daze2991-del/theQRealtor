// Migration 064 (retention cleanup) — SQL text checks. The behaviour itself
// is verified live in a rolled-back transaction on the test account (see the
// task report); these guard the rules against accidental edits.

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'

const sql = readFileSync(new URL('../supabase/migrations/064_retention_cleanup.sql', import.meta.url), 'utf8')
// SQL with line comments removed, for checks about statements (not prose).
const code = sql.split('\n').map(l => l.replace(/--.*$/, '')).join('\n')
const fn = sql.slice(sql.indexOf('create or replace function public.run_retention_cleanup'))
const trigger = sql.slice(
  sql.indexOf('create or replace function public.sms_consent_events_append_only'),
  sql.indexOf('create or replace function public.run_retention_cleanup'))

describe('retention periods match the Privacy Policy', () => {
  it('anonymous scans: 24 months, never converted scans', () => {
    expect(fn).toContain("v_scan_cutoff     timestamp   := (now() at time zone 'utc') - interval '24 months'")
    expect(fn.match(/where not converted and created_at < v_scan_cutoff/g)!.length).toBeGreaterThanOrEqual(3)
    expect(fn).not.toMatch(/delete from public\.scan_events[^;]*converted = true/)
  })

  it('consent history: 5 years, never the newest row per phone', () => {
    expect(fn).toContain("v_consent_cutoff  timestamptz := now() - interval '5 years'")
    expect(fn).toMatch(/row_number\(\) over \(partition by phone_e164 order by received_at desc, id desc\)/)
    expect(fn).toMatch(/where rn > 1 and received_at < v_consent_cutoff/)
  })

  it('never touches sms_contacts (suppression state) or leads', () => {
    expect(fn).not.toMatch(/sms_contacts/)
    expect(fn).not.toMatch(/public\.leads/)
  })

  it('housekeeping: cron history > 30 days, own log > 2 years', () => {
    expect(fn).toContain("delete from cron.job_run_details where start_time < now() - interval '30 days'")
    expect(fn).toContain("delete from public.retention_runs where ran_at < now() - interval '2 years'")
  })
})

describe('consent trigger: one narrow DELETE exception', () => {
  it('requires the flag, > 5 years, and a newer row for the same phone', () => {
    expect(trigger).toContain("coalesce(current_setting('app.retention_purge', true), '') = 'on'")
    expect(trigger).toContain("old.received_at < now() - interval '5 years'")
    expect(trigger).toMatch(/where n\.phone_e164 = old\.phone_e164\s+and \(n\.received_at > old\.received_at\s+or \(n\.received_at = old\.received_at and n\.id > old\.id\)\)/)
    expect(trigger).toContain("raise exception 'sms_consent_events is append-only: DELETE is not permitted'")
  })

  it('TRUNCATE still blocked, UPDATE rules unchanged, search_path pinned', () => {
    expect(trigger).toContain("raise exception 'sms_consent_events is append-only: TRUNCATE is not permitted'")
    expect(trigger).toContain("or pg_trigger_depth() < 2")
    expect(trigger).toContain("set search_path to ''")
  })

  it('the function sets the flag only around the consent delete and turns it off', () => {
    const on = fn.indexOf("set_config('app.retention_purge', 'on', true)")
    const del = fn.indexOf('delete from public.sms_consent_events e')
    const off = fn.indexOf("set_config('app.retention_purge', 'off', true)")
    expect(on).toBeGreaterThan(-1)
    expect(on).toBeLessThan(del)
    expect(del).toBeLessThan(off)
  })

  it('no DELETE grant is handed to anyone on sms_consent_events', () => {
    expect(code).not.toMatch(/grant[^;]*delete[^;]*sms_consent_events/i)
  })
})

describe('safety properties of run_retention_cleanup', () => {
  it('SECURITY DEFINER, pinned search_path, EXECUTE revoked from public/anon/authenticated', () => {
    expect(fn).toMatch(/security definer\s+set search_path = ''/)
    expect(sql).toContain('revoke all on function public.run_retention_cleanup(integer, integer, boolean) from public, anon, authenticated;')
  })

  it('bounded batches, with a hard ceiling on caller-supplied sizes', () => {
    expect(fn).toContain('greatest(1, least(coalesce(p_batch_size, 5000), 50000))')
    expect(fn).toContain('greatest(1, least(coalesce(p_max_batches, 20), 1000))')
    expect(fn.match(/limit v_batch/g)!.length).toBe(2)
  })

  it('rolls scans up in the same statement, before the delete', () => {
    const rolled = fn.indexOf('insert into public.scan_event_rollups')
    const del = fn.indexOf('delete from public.scan_events s')
    expect(rolled).toBeGreaterThan(-1)
    expect(rolled).toBeLessThan(del)
    expect(fn).toContain('on conflict on constraint scan_event_rollups_key do update')
  })

  it('log and rollup tables hold no personal data and are locked down', () => {
    for (const t of ['scan_event_rollups', 'retention_runs']) {
      expect(sql).toContain(`alter table public.${t} enable row level security;`)
      expect(sql).toContain(`revoke all on public.${t} from public, anon, authenticated;`)
    }
    const tables = sql.slice(sql.indexOf('create table if not exists public.scan_event_rollups'), sql.indexOf('-- ── 5.'))
    expect(tables).not.toMatch(/phone|email|name|message_body/i)
  })

  it('daily at 10:00 UTC via pg_cron', () => {
    expect(sql).toContain('create extension if not exists pg_cron;')
    expect(sql).toContain("select cron.schedule('retention-cleanup', '0 10 * * *', $cron$select public.run_retention_cleanup()$cron$);")
  })

  it('migration itself contains no DROP and no top-level DELETE', () => {
    expect(code).not.toMatch(/^\s*drop\s/im)
    const beforeFn = code.slice(0, code.indexOf('create or replace function public.run_retention_cleanup'))
    expect(beforeFn).not.toMatch(/^\s*delete\s/im)
  })
})
