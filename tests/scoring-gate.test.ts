// Free vs paid lead-scoring gate (migration 066 + lib/plans.ts +
// lib/scoringAccess.ts). Three layers checked here:
//   1. featuresForPlan().leadScoring parity across every plan.
//   2. plan_can_score() SQL text parity with that same flag (migration 066
//      is never applied against a live DB in this suite — see the task
//      report for the live rolled-back RLS-isolation check, which requires
//      the migration to actually be applied first).
//   3. The seller-report API (app/api/report/[token]/route.ts), which nulls
//      tier/motivation/return_visit and adds `scoringEnabled` in its own JS,
//      independent of the DB views — fully testable with a mocked Supabase
//      admin client, no live database.

import { readFileSync } from 'fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeFakeDb } from './helpers/fakeSupabase'

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

const { PLAN_CONFIG, featuresForPlan } = await import('../lib/plans')

// ── 1. featuresForPlan() parity ──────────────────────────────────────────────
describe('featuresForPlan(): canUseSms / canUseEmailAlerts', () => {
  it.each(Object.keys(PLAN_CONFIG))('%s', plan => {
    const f = featuresForPlan(plan)
    if (plan === 'free') {
      expect(f.leadScoring).toBe(false)
      expect(f.canUseSms).toBe(false)
      expect(f.canUseEmailAlerts).toBe(true)
    } else {
      expect(f.leadScoring).toBe(true)
      expect(f.canUseSms).toBe(true)
      expect(f.canUseEmailAlerts).toBe(true)
    }
  })

  it('unknown/typo plan strings and null/undefined fall back to Free (no scoring, no SMS, email on)', () => {
    for (const bogus of ['bogus', '', 'FREE', 'Pro', null, undefined]) {
      const f = featuresForPlan(bogus as any)
      expect(f.leadScoring).toBe(false)
      expect(f.canUseSms).toBe(false)
      expect(f.canUseEmailAlerts).toBe(true)
    }
  })

  it('every plan keeps canUseEmailAlerts=true — Free gets email instead of SMS, never neither', () => {
    for (const plan of Object.keys(PLAN_CONFIG)) {
      expect(featuresForPlan(plan).canUseEmailAlerts).toBe(true)
    }
  })
})

// ── 2. plan_can_score() SQL parity (migration 066, not yet applied live) ────
describe('plan_can_score() in migration 066 mirrors featuresForPlan().leadScoring', () => {
  const sql = src('supabase/migrations/066_scoring_gate.sql')
  // Pull the allow-list straight out of the function body so this test fails
  // the moment the SQL and lib/plans.ts drift, instead of hand-duplicating
  // the list and silently passing if both drift together.
  const m = sql.match(/select coalesce\(p_plan, 'free'\) in \(([^)]+)\)/)
  const allowList = m ? m[1].split(',').map(s => s.trim().replace(/^'|'$/g, '')) : []

  it('the SQL exists and is a simple allow-list, not a NOT-equal-to-free check', () => {
    expect(m).toBeTruthy()
    expect(sql).not.toContain("<> 'free'")
    expect(sql).not.toContain("!= 'free'")
  })

  it.each(Object.keys(PLAN_CONFIG))('%s', plan => {
    expect(allowList.includes(plan)).toBe(featuresForPlan(plan).leadScoring)
  })

  it('an unrecognized plan string is NOT in the SQL allow-list either (the bug this test was written to catch)', () => {
    expect(allowList.includes('bogus')).toBe(false)
  })

  it('security_invoker=true on both views, so existing RLS still applies — only column nulling is added', () => {
    expect(sql).toContain('create or replace view public.leads_scoped\n  with (security_invoker = true)')
    expect(sql).toContain('create or replace view public.scan_events_scoped\n  with (security_invoker = true)')
  })

  it('leads_scoped keeps only the two request counters in score_breakdown for Free, drops everything else', () => {
    expect(sql).toContain("'requested_showing', coalesce((l.score_breakdown ->> 'requested_showing')::int, 0)")
    expect(sql).toContain("'requested_info',    coalesce((l.score_breakdown ->> 'requested_info')::int, 0)")
  })

  it('leads_scoped nulls motivation_level and hot_notified_at for Free too, not just tier/motivation/intent_score', () => {
    expect(sql).toContain('case when public.plan_can_score(pr.plan) then l.motivation_level else null end as motivation_level')
    expect(sql).toContain('case when public.plan_can_score(pr.plan) then l.hot_notified_at else null end as hot_notified_at')
  })

  it('leads_scoped keeps contact_quality ungated — it records phone/email validity (migration 020), not scoring', () => {
    // Selected bare, with no plan_can_score() CASE wrapping it, unlike every
    // scoring-derived column above.
    expect(sql).toMatch(/\bl\.contact_quality,\n/)
    expect(sql).not.toContain('then l.contact_quality')
  })

  it('scan_events_scoped forces return_visit to false (not null) for Free — the base column is NOT NULL', () => {
    expect(sql).toContain('then se.return_visit else false end as return_visit')
  })

  it('scan_events_scoped also nulls time_on_page_sec, photos_viewed and days_since_first_visit for Free — consistent with the per-lead aggregates above', () => {
    expect(sql).toContain('then se.time_on_page_sec else null end as time_on_page_sec')
    expect(sql).toContain('then se.photos_viewed else null end as photos_viewed')
    expect(sql).toContain('then se.days_since_first_visit else null end as days_since_first_visit')
  })

  it('scan_events_scoped keeps cta_clicked ungated — it is how the showing/question signal is read before a lead exists', () => {
    expect(sql).toMatch(/\bse\.cta_clicked, se\.converted, se\.sign_id/)
  })

  it('both views revoke all default access, then grant select to authenticated only — nothing for anon', () => {
    expect(sql).toContain('revoke all on public.leads_scoped from public, anon, authenticated;\ngrant select on public.leads_scoped to authenticated;')
    expect(sql).toContain('revoke all on public.scan_events_scoped from public, anon, authenticated;\ngrant select on public.scan_events_scoped to authenticated;')
  })
})

// ── 3. Seller report API: scoringEnabled + nulled fields for Free ───────────
vi.mock('server-only', () => ({}))
let db = makeFakeDb()
vi.mock('../lib/supabase-admin', () => ({ createAdminSupabase: () => db.client }))

const { GET: reportGET } = await import('../app/api/report/[token]/route')

const TOKEN = 'tok-abc'
const AGENT_ID = 'agent-1'

function seed(plan: string | null) {
  db = makeFakeDb()
  db.tables.properties = [{
    id: 'P1', user_id: AGENT_ID, address: '1 Main St', city: 'LA', state: 'CA',
    active: true, deactivated_at: null, created_at: new Date().toISOString(),
    agent_name: 'Ann Agent', agent_phone: '+14155550100', price: 900000, beds: 3, baths: 2,
    report_token: TOKEN,
  }]
  db.tables.profiles = [{ id: AGENT_ID, plan, name: 'Ann', phone: '+14155550100', dre: null, brokerage: null, photo_url: null }]
  db.tables.leads = [
    { id: 'L1', property_id: 'P1', tier: 'hot', motivation: 'motivated', notes: 'a question', created_at: new Date().toISOString(), score_breakdown: { requested_showing: 1, requested_info: 0, return_visits: { count: 2, points: 3 } } },
  ]
  db.tables.scan_events = [
    { property_id: 'P1', created_at: new Date().toISOString(), sign_id: null, return_visit: true, cta_clicked: null, photos_viewed: 2, time_on_page_sec: 40 },
  ]
}

const call = () => reportGET(new Request(`https://theqrealtor.com/api/report/${TOKEN}`), { params: { token: TOKEN } })

describe('GET /api/report/[token]: scoringEnabled gate', () => {
  it('Free owner: scoringEnabled=false, tier/motivation nulled, return_visit forced false, showing count kept', async () => {
    seed('free')
    const json = await (await call()).json()
    expect(json.scoringEnabled).toBe(false)
    expect(json.leads[0].tier).toBeNull()
    expect(json.leads[0].motivation).toBeNull()
    expect(json.leads[0].score_breakdown).toEqual({ requested_showing: 1 })
    expect(json.scanEvents[0].return_visit).toBe(false)
  })

  it('paid owner (starter): scoringEnabled=true, tier/motivation/return_visit all pass through', async () => {
    seed('starter')
    const json = await (await call()).json()
    expect(json.scoringEnabled).toBe(true)
    expect(json.leads[0].tier).toBe('hot')
    expect(json.leads[0].motivation).toBe('motivated')
    expect(json.scanEvents[0].return_visit).toBe(true)
  })

  it('no owner profile row at all (edge case) falls back to scoringEnabled=false, same as Free', async () => {
    seed('starter')
    db.tables.profiles = []
    const json = await (await call()).json()
    expect(json.scoringEnabled).toBe(false)
    expect(json.leads[0].tier).toBeNull()
  })

  it('Free owner: photos_viewed and time_on_page_sec are nulled too (same fields 066 strips from scan_events_scoped)', async () => {
    seed('free')
    const e = (await (await call()).json()).scanEvents[0]
    expect(e.photos_viewed).toBeNull()
    expect(e.time_on_page_sec).toBeNull()
    expect(e.return_visit).toBe(false)
    expect(e.cta_clicked).toBeNull() // untouched field still present
  })

  it('paid owner: photos_viewed and time_on_page_sec pass through unchanged', async () => {
    seed('starter')
    const e = (await (await call()).json()).scanEvents[0]
    expect(e.photos_viewed).toBe(2)
    expect(e.time_on_page_sec).toBe(40)
  })

  it('no owner id on the property fails CLOSED: scoringEnabled=false and nothing scoring-derived leaves', async () => {
    seed('starter')
    db.tables.properties[0].user_id = null
    const json = await (await call()).json()
    expect(json.scoringEnabled).toBe(false)
    expect(json.leads[0].tier).toBeNull()
    expect(json.leads[0].motivation).toBeNull()
    expect(json.scanEvents[0].return_visit).toBe(false)
    expect(json.scanEvents[0].photos_viewed).toBeNull()
    expect(json.scanEvents[0].time_on_page_sec).toBeNull()
  })

  it('Free response never carries a raw plan/tier string anywhere in the JSON text', async () => {
    seed('free')
    const text = JSON.stringify(await (await call()).json())
    expect(text).not.toContain('"plan"')
    expect(text).not.toContain('"tier":"hot"')
  })
})
