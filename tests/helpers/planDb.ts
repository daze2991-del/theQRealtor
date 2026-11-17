// In-memory Postgres (PGlite) with just enough of the real schema to run the
// plan-locking migrations for real: 059 → 060 → 061 → 062 → 063 → 067, in
// order, from the files in supabase/migrations. No network, no live database.
//
// auth.role() is stubbed from a session setting so tests can act as a signed-in
// user (`asRole('authenticated')`) or as the server / a manual Supabase edit
// (the default: no role, which every protect trigger lets through).

import { readFileSync } from 'fs'
import { PGlite } from '@electric-sql/pglite'

const MIGRATIONS = [
  '059_protect_account_status_billing_interval.sql',
  '060_plan_locking.sql',
  '061_plan_lock_hardening.sql',
  '062_free_swap_limit.sql',
  '063_free_swap_limit_fix.sql',
  '067_downgrade_auto_fit.sql',
]

const SCHEMA = `
create role anon; create role authenticated; create role service_role;
create schema auth;
create function auth.role() returns text language sql stable as $$ select nullif(current_setting('test.role', true), '') $$;

create table public.profiles (
  id uuid primary key, plan text default 'free', beta_joined_at timestamptz,
  subscription_status text, price_id text, stripe_customer_id text, stripe_subscription_id text,
  current_period_end timestamptz, cancel_at_period_end boolean, trial_end timestamptz, is_founding boolean,
  cancel_at timestamptz, cancellation_reason text, last_payment_failed_at timestamptz,
  account_status text, billing_interval text, sms_alerts_enabled boolean default false
);
create table public.properties (
  id uuid primary key default gen_random_uuid(), user_id uuid, active boolean default true,
  deleted_at timestamptz, created_at timestamptz default now()
);
create table public.signs (
  id uuid primary key default gen_random_uuid(), agent_id uuid not null, label text not null default 'Sign',
  archived_at timestamptz, created_at timestamptz not null default now()
);
create table public.sign_assignments (
  id uuid primary key default gen_random_uuid(), sign_id uuid not null, property_id uuid,
  assigned_at timestamptz not null default now(), unassigned_at timestamptz
);
create table public.scan_events (
  id uuid primary key default gen_random_uuid(), property_id uuid, sign_id uuid,
  created_at timestamp default (now() at time zone 'UTC')
);
create table public.leads (
  id uuid primary key default gen_random_uuid(), property_id uuid, sign_id uuid,
  created_at timestamp default (now() at time zone 'UTC')
);
`

// Created by an earlier migration (024) that this harness doesn't load.
const PROFILE_TRIGGER = `
create trigger trg_protect_profile_entitlements before update on public.profiles
  for each row execute function public.protect_profile_entitlements();
`

const src = (f: string) => readFileSync(new URL(`../../supabase/migrations/${f}`, import.meta.url), 'utf8')

export async function makePlanDb() {
  const db = new PGlite()
  await db.exec(SCHEMA)
  for (const f of MIGRATIONS) {
    await db.exec(src(f))
    if (f.startsWith('059')) await db.exec(PROFILE_TRIGGER)
  }

  let n = 0
  const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`

  const one = async <T = any>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows[0]
  const all = async <T = any>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows

  return {
    db, uuid, one, all,
    async asRole(role: string | null) { await db.query(`select set_config('test.role', $1, false)`, [role ?? '']) },

    async agent(plan: string | null, extra: Record<string, unknown> = {}) {
      const id = uuid()
      await db.query(`insert into public.profiles (id, plan, beta_joined_at) values ($1, $2, $3)`,
        [id, plan, (extra.beta_joined_at as string) ?? new Date().toISOString()])
      return id
    },
    /** A live listing with `scans` scans and `leads` leads in the last 30 days. */
    async listing(agentId: string, { scans = 0, leads = 0, active = true } = {}) {
      const id = uuid()
      await db.query(`insert into public.properties (id, user_id, active) values ($1, $2, $3)`, [id, agentId, active])
      for (let i = 0; i < scans; i++) await db.query(`insert into public.scan_events (property_id) values ($1)`, [id])
      for (let i = 0; i < leads; i++) await db.query(`insert into public.leads (property_id) values ($1)`, [id])
      return id
    },
    /** A sign, optionally assigned to a listing, with `scans` scans in the window. */
    async sign(agentId: string, { listing = null as string | null, scans = 0 } = {}) {
      const id = uuid()
      await db.query(`insert into public.signs (id, agent_id) values ($1, $2)`, [id, agentId])
      if (listing) await db.query(`insert into public.sign_assignments (sign_id, property_id) values ($1, $2)`, [id, listing])
      for (let i = 0; i < scans; i++) await db.query(`insert into public.scan_events (sign_id, property_id) values ($1, $2)`, [id, listing])
      return id
    },
    async setPlan(agentId: string, plan: string | null) {
      await db.query(`update public.profiles set plan = $2 where id = $1`, [agentId, plan])
    },
    async state(agentId: string) {
      const p = await one(`select plan, plan_choice_required_at, free_listing_swapped_at, free_signs_swapped_at from public.profiles where id = $1`, [agentId])
      const listings = await all(`select id, plan_locked_at from public.properties where user_id = $1 order by id`, [agentId])
      const signs = await all(`select id, plan_locked_at from public.signs where agent_id = $1 order by id`, [agentId])
      return {
        ...p,
        unlockedListings: listings.filter((r: any) => !r.plan_locked_at).map((r: any) => r.id),
        lockedListings: listings.filter((r: any) => r.plan_locked_at).map((r: any) => r.id),
        unlockedSigns: signs.filter((r: any) => !r.plan_locked_at).map((r: any) => r.id),
        lockedSigns: signs.filter((r: any) => r.plan_locked_at).map((r: any) => r.id),
        totalListings: listings.length,
        totalSigns: signs.length,
      }
    },
  }
}
