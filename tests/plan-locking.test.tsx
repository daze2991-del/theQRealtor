// End-of-trial chooser + plan locking (migration 060). Supabase and Twilio
// are mocked here: no live data, no real texts. The SQL side (triggers,
// apply_free_selection, unlock on upgrade) is verified live in rolled-back
// transactions with throwaway accounts. See the task report.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { makeFakeDb } from './helpers/fakeSupabase'

let db = makeFakeDb()
let user: { id: string } | null = { id: 'agent-1' }
const AGENT = 'agent-1'

vi.mock('../lib/supabase-admin', () => ({ createAdminSupabase: () => db.client }))
vi.mock('../lib/supabase-server', () => ({
  createServerSupabase: () => ({
    auth: { getUser: async () => ({ data: { user }, error: null }) },
    from: (t: string) => db.client.from(t),
    rpc: (n: string, a: unknown) => db.client.rpc(n, a),
  }),
}))
const create = vi.fn()
vi.mock('twilio', () => ({ default: vi.fn(() => ({ messages: { create } })) }))

const planLock = await import('../lib/planLock')
const { REQUESTS_PAUSED_COPY, isAcceptingRequests, rankByActivity, buildActivityStats, trialEndingBanner, TRIAL_ENDED_INTRO, CHOOSE_PLAN_BANNER } = planLock
const { choiceEligibility, parseSelection } = await import('../lib/planChoice')
const { PLAN_CONFIG } = await import('../lib/plans')
const { getTrialStatus } = await import('../lib/trial')
const { POST: submitLead } = await import('../app/api/submit-lead/route')
const { POST: openHouseCheckin } = await import('../app/api/open-house-checkin/route')
const { POST: availability } = await import('../app/api/listing-availability/route')
const { POST: chooseFree } = await import('../app/api/plan/choose-free/route')
const { POST: freeSwap } = await import('../app/api/plan/free-swap/route')
const { GET: choiceOptions } = await import('../app/api/plan/free-choice-options/route')
const { POST: createProperty } = await import('../app/api/properties/route')
const { POST: createSign } = await import('../app/api/signs/create/route')
const { PATCH: patchSign } = await import('../app/api/signs/[signId]/route')
const { GET: qBridge } = await import('../app/q/[qrId]/route')
const { default: PlanChooser } = await import('../components/PlanChooser')
const { default: RequestsPausedNotice } = await import('../components/RequestsPausedNotice')
const { eligibleSigns } = await import('../components/FreeSelection')

const DAY = 86_400_000
const daysAgo = (n: number) => new Date(Date.now() - n * DAY).toISOString()
const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const P1 = '11111111-1111-4111-8111-111111111111'
const P2 = '22222222-2222-4222-8222-222222222222'
const S1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'

function seed(plan: string, joined: string | null = daysAgo(1)) {
  db = makeFakeDb()
  db.tables.profiles = [{
    id: AGENT, plan, beta_joined_at: joined, name: 'Agent', phone: '+14155550100',
    notify_showing: true, notify_question: true, quiet_hours_enabled: false,
  }]
  db.tables.properties = [{ id: P1, user_id: AGENT, active: true, deleted_at: null, address: '1 Test St', agent_name: 'Agent', agent_phone: null, plan_locked_at: null, created_at: daysAgo(20) }]
  db.tables.signs = []
  db.tables.sign_assignments = []
  db.tables.leads = []
  db.tables.scan_events = []
}

let ip = 0
const hdrs = () => ({ 'content-type': 'application/json', 'x-forwarded-for': `10.7.${Math.floor(++ip / 200)}.${ip % 200}`, 'user-agent': 'Mozilla/5.0' })
const post = (fn: (r: Request) => Promise<Response>, url: string, body: unknown) =>
  fn(new Request(`https://x${url}`, { method: 'POST', headers: hdrs(), body: JSON.stringify(body) }))
const submit = (extra: Record<string, unknown> = {}) => post(submitLead, '/api/submit-lead', {
  propertyId: P1, name: 'Test Buyer', phone: '(310) 555-0142', motivation: 'hot', smsConsent: true,
  engagement: { ctaClicked: 'showing', visitCount: 1, photosViewed: 0, timeOnPageSec: 5 }, ...extra,
})
const checkin = (extra: Record<string, unknown> = {}) => post(openHouseCheckin, '/api/open-house-checkin', {
  propertyId: P1, name: 'Test Buyer', phone: '(310) 555-0142', working_with_agent: false, ...extra,
})
const FORBIDDEN_BUYER_WORDS = /trial|subscri|billing|plan\b|upgrade|locked/i

beforeEach(() => {
  user = { id: AGENT }
  create.mockReset().mockResolvedValue({ sid: 'SM_x', status: 'accepted', from: null })
  process.env.TWILIO_ACCOUNT_SID = 'AC_test'
  process.env.TWILIO_AUTH_TOKEN = 'token'
  process.env.TWILIO_MESSAGING_SERVICE_SID = 'MG_test'
  for (const k of ['log', 'warn', 'error'] as const) vi.spyOn(console, k).mockImplementation(() => {})
})

// ── Copy ─────────────────────────────────────────────────────────────────────
describe('buyer-facing locked copy', () => {
  it('is exactly the approved string, marked provisional', () => {
    expect(REQUESTS_PAUSED_COPY).toBe("This listing isn't taking requests through this page right now. Please contact the listing agent directly.")
    expect(src('lib/planLock.ts')).toMatch(/PROVISIONAL — pending attorney review/)
    expect(REQUESTS_PAUSED_COPY).not.toMatch(FORBIDDEN_BUYER_WORDS)
  })

  it('the notice renders only that sentence: no phone, no consent box', () => {
    const html = renderToStaticMarkup(createElement(RequestsPausedNotice))
    expect(html).toContain('This listing isn&#x27;t taking requests through this page right now.')
    expect(html).not.toMatch(/tel:|sms:|mailto:|checkbox|consent/i)
  })
})

// ── C. Expired trial, no choice ──────────────────────────────────────────────
describe('expired trial with no plan chosen: buyers are locked out, agent keeps everything', () => {
  beforeEach(() => seed('trial', daysAgo(46)))

  it('isAcceptingRequests is false and nothing is stamped', async () => {
    expect(await isAcceptingRequests(db.client, P1)).toBe(false)
    expect(db.tables.properties[0].plan_locked_at).toBeNull()
  })

  it('listing-availability returns only a neutral boolean', async () => {
    const res = await post(availability, '/api/listing-availability', { propertyId: P1 })
    const text = await res.text()
    expect(JSON.parse(text)).toEqual({ acceptingRequests: false })
    expect(text).not.toMatch(FORBIDDEN_BUYER_WORDS)
  })

  it('submit-lead rejects (423): no lead, no text to agent or buyer, so the teaser alert cannot fire', async () => {
    const res = await submit()
    expect(res.status).toBe(423)
    const body = await res.json()
    expect(body.error).toBe(REQUESTS_PAUSED_COPY)
    expect(JSON.stringify(body)).not.toMatch(/trial|subscri|billing|plan\b/i)
    expect(db.tables.leads).toHaveLength(0)
    expect(create).not.toHaveBeenCalled()
  })

  it('open-house-checkin rejects (423): no lead', async () => {
    const res = await checkin()
    expect(res.status).toBe(423)
    expect((await res.json()).error).toBe(REQUESTS_PAUSED_COPY)
    expect(db.tables.leads).toHaveLength(0)
  })

  it('dashboard lead/analytics pages are not gated on trial or lock state', () => {
    for (const p of ['app/dashboard/leads/page.tsx', 'app/dashboard/page.tsx', 'app/dashboard/analytics/page.tsx']) {
      expect(src(p)).not.toMatch(/getTrialStatus|plan_locked_at|planLock/)
    }
  })

  it('control: an unexpired trial still takes requests', async () => {
    seed('trial', daysAgo(10))
    expect((await submit()).status).toBe(200)
    expect(db.tables.leads).toHaveLength(1)
  })
})

// ── B. Stamped locks ─────────────────────────────────────────────────────────
describe('locked listing / locked sign', () => {
  it('a locked listing rejects both submit routes', async () => {
    seed('free')
    db.tables.properties[0].plan_locked_at = daysAgo(1)
    expect((await submit()).status).toBe(423)
    expect((await checkin()).status).toBe(423)
    expect(db.tables.leads).toHaveLength(0)
  })

  it('a locked sign on an unlocked listing locks requests made through that sign', async () => {
    seed('free')
    db.tables.signs = [{ id: S1, agent_id: AGENT, archived_at: null, plan_locked_at: daysAgo(1) }]
    expect(await isAcceptingRequests(db.client, P1, S1)).toBe(false)
    expect((await submit({ signId: S1 })).status).toBe(423)
    expect((await checkin({ signId: S1 })).status).toBe(423)
    expect(db.tables.leads).toHaveLength(0)
    const res = await post(availability, '/api/listing-availability', { propertyId: P1, signId: S1 })
    expect(await res.json()).toEqual({ acceptingRequests: false })
    // Same listing without the locked sign is open
    expect((await submit()).status).toBe(200)
  })

  it('/q passes the sign id to open-house check-in so a locked sign is honoured', async () => {
    seed('free')
    db.tables.qrcodes = [{ id: 'Q1', property_id: null, type: 'openhouse', sign_id: S1 }]
    db.tables.sign_assignments = [{ sign_id: S1, property_id: P1, unassigned_at: null }]
    db.rpcs.increment_qr_scan_count = () => ({ data: null })
    const res = await qBridge(new Request('https://theqrealtor.com/q/Q1') as any, { params: { qrId: 'Q1' } })
    expect(res.headers.get('location')).toBe(`https://theqrealtor.com/open-house/${P1}?sign=${S1}`)
  })
})

describe('buyer pages never fetch plan_locked_at and replace the CTAs when locked', () => {
  const page = src('app/p/[propertyId]/page.tsx')
  const oh = src('app/open-house/[propertyId]/page.tsx')
  it('explicit column lists, no select(*) on properties', () => {
    for (const s of [page, oh]) {
      expect(s).not.toMatch(/from\('properties'\)\s*\.select\('\*'\)/)
      expect(s).not.toContain('plan_locked_at')
      expect(s).toContain('/api/listing-availability')
    }
  })
  it('/p swaps buttons for the notice and never opens the form sheet while locked', () => {
    expect(page).toMatch(/accepting === false \? \(\s*<RequestsPausedNotice/)
    expect(page).toContain('{intent !== null && accepting !== false && (')
    expect(page).toContain('res.status === 423')
  })
  it('open-house swaps the form for the notice', () => {
    expect(oh).toMatch(/accepting === false \? \(\s*<RequestsPausedNotice/)
  })
})

// ── D. Chooser ───────────────────────────────────────────────────────────────
describe('chooser modal', () => {
  const html = renderToStaticMarkup(createElement(PlanChooser, { onClose: () => {} }))
  it('intro line, three cards with prices and limits from lib/pricing', () => {
    expect(html).toContain('Your 45-day trial has ended. Nothing has been deleted — choose a plan to keep receiving buyer requests.')
    expect(html.match(/data-plan-card=/g)).toHaveLength(3)
    for (const s of ['$0', '$39/mo', '$69/mo', 'Up to 1 active listing and 3 active signs.', 'Up to 3 active listings and 15 active signs.', 'All your active listings, up to 50 active signs.']) {
      expect(html).toContain(s)
    }
  })
  it('nothing pre-selected; Starter/Pro go to the existing billing page', () => {
    expect(html).not.toMatch(/aria-checked="true"|checked=""|aria-pressed="true"/)
    expect(html.match(/href="\/dashboard\/billing"/g)).toHaveLength(2)
  })
  it('DashboardLayout opens it for an expired trial and keeps a reopen banner', () => {
    const dl = src('components/DashboardLayout.tsx')
    expect(dl).toContain('setChooserOpen(getTrialStatus(profile?.beta_joined_at ?? null, resolvedPlan).expired)')
    expect(dl).toContain('{CHOOSE_PLAN_BANNER}')
    expect(dl).toContain('onClick={() => setChooserOpen(true)}')
    expect(CHOOSE_PLAN_BANNER).toBe('Choose a plan to start receiving buyer requests again')
    expect(TRIAL_ENDED_INTRO).toContain('Nothing has been deleted')
  })
})

describe('Free choice: server validation', () => {
  const okRpc = () => { db.rpcs.apply_free_selection = () => ({ data: { plan: 'free' } }) }

  it('expired trial: valid selection calls apply_free_selection(choose) with exactly that selection', async () => {
    seed('trial', daysAgo(46)); okRpc()
    const res = await post(chooseFree, '/api/plan/choose-free', { listingIds: [P1], signIds: ['s1', 's2', 's3'] })
    expect(res.status).toBe(200)
    expect(db.rpcCalls).toEqual([{ name: 'apply_free_selection', args: { p_agent: AGENT, p_mode: 'choose', p_listing: P1, p_signs: ['s1', 's2', 's3'] } }])
  })

  it('rejects more than 1 listing or more than 3 signs without touching the database', async () => {
    seed('trial', daysAgo(46)); okRpc()
    expect((await post(chooseFree, '/api/plan/choose-free', { listingIds: [P1, P2], signIds: [] })).status).toBe(400)
    expect((await post(chooseFree, '/api/plan/choose-free', { listingIds: [P1], signIds: ['a', 'b', 'c', 'd'] })).status).toBe(400)
    expect((await post(freeSwap, '/api/plan/free-swap', { listingIds: [P1, P2] })).status).toBe(403) // not free yet
    seed('free'); okRpc()
    expect((await post(freeSwap, '/api/plan/free-swap', { listingIds: [P1, P2], signIds: [] })).status).toBe(400)
    expect((await post(freeSwap, '/api/plan/free-swap', { listingIds: [P1], signIds: ['a', 'b', 'c', 'd'] })).status).toBe(400)
    expect(db.rpcCalls).toEqual([])
  })

  it.each([
    ['active trial', 'trial', daysAgo(10)],
    ['starter', 'starter', daysAgo(400)],
    ['pro', 'pro', daysAgo(400)],
    ['alpha (founder cohort)', 'alpha', daysAgo(400)],
    ['founding', 'founding', daysAgo(400)],
  ])('rejects the Free route for %s (403)', async (_l, plan, joined) => {
    seed(plan, joined); okRpc()
    expect((await post(chooseFree, '/api/plan/choose-free', { listingIds: [P1], signIds: [] })).status).toBe(403)
    expect(db.rpcCalls).toEqual([])
  })

  it('re-running after the choice is harmless: Free returns success and changes nothing', async () => {
    seed('free'); okRpc()
    const res = await post(chooseFree, '/api/plan/choose-free', { listingIds: [P2], signIds: [] })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, alreadyFree: true })
    expect(db.rpcCalls).toEqual([])
  })

  it('maps SQL refusals to 400s', async () => {
    seed('trial', daysAgo(46))
    db.rpcs.apply_free_selection = () => ({ error: { message: 'invalid_sign' } })
    const res = await post(chooseFree, '/api/plan/choose-free', { listingIds: [P1], signIds: ['x'] })
    expect(res.status).toBe(400)
  })

  it('swap is Free-only and calls apply_free_selection(swap)', async () => {
    seed('free'); okRpc()
    expect((await post(freeSwap, '/api/plan/free-swap', { listingIds: [P1], signIds: [] })).status).toBe(200)
    expect(db.rpcCalls[0].args.p_mode).toBe('swap')
  })

  it('parseSelection dedupes and enforces the caps', () => {
    expect(parseSelection({ listingIds: [P1, P1], signIds: ['a', 'a', 'b'] })).toEqual({ ok: true, listingId: P1, signIds: ['a', 'b'] })
    expect(parseSelection({ listingIds: 'x' }).ok).toBe(false)
  })

  it('free-choice-options: expired trial gets stats + assignment; alpha is refused', async () => {
    seed('trial', daysAgo(46))
    db.tables.signs = [{ id: 'sA', agent_id: AGENT, label: 'A', archived_at: null, plan_locked_at: null, created_at: daysAgo(5) },
                       { id: 'sU', agent_id: AGENT, label: 'U', archived_at: null, plan_locked_at: null, created_at: daysAgo(5) }]
    db.tables.sign_assignments = [{ sign_id: 'sA', property_id: P1, unassigned_at: null }]
    db.tables.scan_events = [{ property_id: P1, sign_id: 'sA', created_at: daysAgo(2) }]
    const body = await (await choiceOptions()).json()
    expect(body.mode).toBe('choose')
    expect(body.listings[0]).toMatchObject({ id: P1, scans30: 1, locked: false })
    expect(body.signs.find((s: any) => s.id === 'sA')).toMatchObject({ assignedPropertyId: P1, scans30: 1 })
    expect(body.signs.find((s: any) => s.id === 'sU').assignedPropertyId).toBeNull()

    seed('alpha', daysAgo(400))
    expect((await choiceOptions()).status).toBe(403)
  })
})

// ── Ranking ──────────────────────────────────────────────────────────────────
describe('recommendation ranking', () => {
  it('orders by 30-day scans, then leads, then recency', () => {
    const r = rankByActivity([
      { id: 'recent',   scans30: 2, leads30: 1, lastActivityAt: daysAgo(1) },
      { id: 'mostScan', scans30: 9, leads30: 0, lastActivityAt: daysAgo(20) },
      { id: 'older',    scans30: 2, leads30: 1, lastActivityAt: daysAgo(9) },
      { id: 'leads',    scans30: 2, leads30: 5, lastActivityAt: daysAgo(15) },
    ])
    expect(r.map(x => x.id)).toEqual(['mostScan', 'leads', 'recent', 'older'])
  })

  it('counts only the last 30 days and reads tz-less DB timestamps as UTC', () => {
    const now = Date.parse('2026-10-06T12:00:00Z')
    const stats = buildActivityStats(
      [{ id: 'p', created_at: '2026-01-01T00:00:00Z' }],
      [{ property_id: 'p', created_at: '2026-10-05T10:00:00' }, { property_id: 'p', created_at: '2026-08-01T10:00:00' }],
      [{ property_id: 'p', created_at: '2026-10-01T09:00:00' }],
      'property_id', now)
    expect(stats[0]).toEqual({ id: 'p', scans30: 1, leads30: 1, lastActivityAt: '2026-10-05T10:00:00.000Z' })
  })

  it('no activity falls back to created_at', () => {
    const [s] = buildActivityStats([{ id: 'p', created_at: '2026-09-01T00:00:00.000Z' }], [], [], 'property_id', Date.parse('2026-10-06T00:00:00Z'))
    expect(s.lastActivityAt).toBe('2026-09-01T00:00:00.000Z')
  })

  it('signs offered: chosen listing first (ranked), then unassigned; other listings excluded', () => {
    const mk = (id: string, assigned: string | null, scans: number) => ({ id, label: id, locked: false, assignedPropertyId: assigned, scans30: scans, leads30: 0, lastActivityAt: daysAgo(1) })
    const { onListing, unassigned } = eligibleSigns([mk('a', P1, 1), mk('b', P1, 5), mk('c', P2, 99), mk('u', null, 3)], P1)
    expect(onListing.map(s => s.id)).toEqual(['b', 'a'])
    expect(unassigned.map(s => s.id)).toEqual(['u'])
  })
})

// ── Limits ───────────────────────────────────────────────────────────────────
describe('locked items do not count toward limits', () => {
  const postListing = () => post(createProperty, '/api/properties', { address: '2 Test St' })
  const postSign = () => post(createSign, '/api/signs/create', { label: 'Yard' })

  it('listing: a locked live listing does not use the Free slot', async () => {
    seed('free')
    expect((await postListing()).status).toBe(403)            // unlocked P1 fills the 1 slot
    db.tables.properties[0].plan_locked_at = daysAgo(1)
    expect((await postListing()).status).toBe(200)
  })

  it('signs: locked signs do not use the Free slots', async () => {
    seed('free')
    db.tables.signs = [0, 1, 2].map(i => ({ id: `s${i}`, agent_id: AGENT, label: 'x', archived_at: null, plan_locked_at: null }))
    expect((await postSign()).status).toBe(403)
    db.tables.signs.forEach(s => { s.plan_locked_at = daysAgo(1) })
    expect((await postSign()).status).toBe(200)
  })

  it('unarchiving a locked sign needs no slot (it stays locked)', async () => {
    seed('free')
    db.tables.signs = [
      ...[0, 1, 2].map(i => ({ id: `s${i}`, agent_id: AGENT, label: 'x', archived_at: null, plan_locked_at: null })),
      { id: 'sL', agent_id: AGENT, label: 'locked', archived_at: daysAgo(3), plan_locked_at: daysAgo(4) },
    ]
    const res = await patchSign(new Request('https://x/api/signs/sL', { method: 'PATCH', headers: hdrs(), body: JSON.stringify({ archived: false }) }), { params: { signId: 'sL' } })
    expect(res.status).toBe(200)
  })

  it('sidebar meters and client pre-checks exclude locked items too', () => {
    expect(src('components/DashboardLayout.tsx')).toContain("p.active === true && !p.plan_locked_at")
    expect(src('components/DashboardLayout.tsx')).toContain(".is('plan_locked_at', null)")
    expect(src('app/dashboard/new-property/page.tsx')).toContain(".is('plan_locked_at', null)")
    expect(src('app/dashboard/onboarding/page.tsx')).toContain(".is('plan_locked_at', null)")
  })
})

// ── Protection ───────────────────────────────────────────────────────────────
describe('agents cannot set or clear plan_locked_at from the browser', () => {
  function walk(dir: string): string[] {
    return readdirSync(dir).flatMap(f => {
      const p = join(dir, f)
      if (statSync(p).isDirectory()) return f === 'node_modules' ? [] : walk(p)
      return /\.(tsx?|jsx?)$/.test(f) ? [p] : []
    })
  }
  it('no "use client" file writes plan_locked_at', () => {
    const root = new URL('..', import.meta.url).pathname
    const offenders = [...walk(join(root, 'app')), ...walk(join(root, 'components'))]
      .filter(f => /^['"]use client['"]/m.test(readFileSync(f, 'utf8')))
      .filter(f => /plan_locked_at\s*:/.test(readFileSync(f, 'utf8')))
    expect(offenders).toEqual([])
  })

  it('migration 060 guards the column with the same mechanism/errcode as profile entitlements', () => {
    const sql = src('supabase/migrations/060_plan_locking.sql')
    expect(sql).toContain("before insert or update on public.properties")
    expect(sql).toContain("before insert or update on public.signs")
    expect(sql.match(/errcode = 'insufficient_privilege'/g)!.length).toBeGreaterThanOrEqual(4)
    expect(sql).toMatch(/revoke all on function public\.apply_free_selection\(uuid, text, uuid, uuid\[\]\) from public, anon, authenticated;/)
  })
})

describe('plan_limits() in SQL mirrors lib/plans.ts', () => {
  const sql = src('supabase/migrations/060_plan_locking.sql')
  const toNum = (v: string) => (v === 'null' ? null : Number(v))
  const rows = [...sql.matchAll(/when '(\w+)'\s+then max_listings := (null|\d+);\s+max_signs := (null|\d+);/g)]
  it.each(Object.keys(PLAN_CONFIG).filter(p => p !== 'free'))('%s', plan => {
    const row = rows.find(r => r[1] === plan)
    expect(row, `plan_limits() has no row for ${plan}`).toBeTruthy()
    expect([toNum(row![2]), toNum(row![3])]).toEqual([PLAN_CONFIG[plan as keyof typeof PLAN_CONFIG].maxActiveListings, PLAN_CONFIG[plan as keyof typeof PLAN_CONFIG].maxActiveSigns])
  })
  it('free / unknown fallback', () => {
    const m = sql.match(/else\s+max_listings := (null|\d+);\s+max_signs := (null|\d+);\s+-- free \+ unknown/)
    expect([toNum(m![1]), toNum(m![2])]).toEqual([PLAN_CONFIG.free.maxActiveListings, PLAN_CONFIG.free.maxActiveSigns])
  })
})

// ── F. Trial warnings ────────────────────────────────────────────────────────
describe('trial warning banners', () => {
  it('say what happens next', () => {
    expect(trialEndingBanner(10)).toBe('Your trial ends in 10 days. After that, choose Free, Starter or Pro — nothing is deleted.')
    expect(trialEndingBanner(3)).toBe('Your trial ends in 3 days. After that, choose Free, Starter or Pro — nothing is deleted.')
    expect(trialEndingBanner(1)).toBe('Your trial ends in 1 day. After that, choose Free, Starter or Pro — nothing is deleted.')
  })
  it('DashboardLayout uses it for both stages; the old wording is gone', () => {
    const dl = src('components/DashboardLayout.tsx')
    expect(dl).toContain('{trialEndingBanner(daysRemaining)}')
    expect(dl).not.toContain('upgrade to keep access to your leads')
    expect(dl).not.toContain('Your trial has ended — upgrade to continue.')
  })
})

// ── Founder ──────────────────────────────────────────────────────────────────
describe('founder (alpha) behaviour unchanged', () => {
  it('old join date, still exempt, still takes requests, no chooser', async () => {
    seed('alpha', daysAgo(400))
    expect(getTrialStatus(daysAgo(400), 'alpha')).toMatchObject({ exempt: true, expired: false })
    expect(choiceEligibility('alpha', daysAgo(400))).toBeNull()
    expect(await isAcceptingRequests(db.client, P1)).toBe(true)
    expect((await submit()).status).toBe(200)
    expect(db.tables.leads).toHaveLength(1)
  })
})

// ── Migration 061 follow-ups ─────────────────────────────────────────────────
describe('061: unlock trigger also fires on starter → pro', () => {
  const sql = src('supabase/migrations/061_plan_lock_hardening.sql')
  const when = sql.slice(sql.indexOf('create trigger trg_unlock_plan_locks_on_upgrade'))
  it('keeps the free/trial upgrade case and adds starter → pro', () => {
    expect(when).toContain("(old.plan in ('free', 'trial') and new.plan in ('starter', 'pro', 'founding', 'alpha'))")
    expect(when).toContain("or (old.plan = 'starter' and new.plan = 'pro')")
    expect(when).toContain('execute function public.unlock_plan_locks_on_upgrade()')
  })
  it('unlocks up to Pro’s limits: the function reads plan_limits(new.plan), and Pro has no listing cap and 50 signs', () => {
    expect(src('supabase/migrations/060_plan_locking.sql')).toContain('from public.plan_limits(new.plan)')
    expect([PLAN_CONFIG.pro.maxActiveListings, PLAN_CONFIG.pro.maxActiveSigns]).toEqual([null, 50])
  })
  it('does not fire on a downgrade (pro → starter, anything → free)', () => {
    expect(when).not.toMatch(/old\.plan = 'pro'/)
    expect(when).not.toMatch(/new\.plan (=|in \([^)]*)'free'/)
  })
  it('revokes EXECUTE on both trigger functions and pins protect_profile_entitlements search_path', () => {
    expect(sql).toContain('revoke all on function public.protect_property_plan_lock()   from public, anon, authenticated;')
    expect(sql).toContain('revoke all on function public.unlock_plan_locks_on_upgrade() from public, anon, authenticated;')
    expect(sql).toContain('alter function public.protect_profile_entitlements() set search_path = public;')
  })
})

describe('"change what\'s active" links are shown only to Free agents', () => {
  it.each([
    ['app/dashboard/signs/page.tsx', '{isFreePlan && signs.some(s => s.locked) && ('],
    ['app/dashboard/properties/page.tsx', '{isFreePlan && properties.some((p: any) => p.plan_locked_at) && ('],
  ])('%s', (file, gate) => {
    const s = src(file)
    expect(s).toContain("setIsFreePlan(profile?.plan === 'free')")   // exact match, no 'free' fallback
    expect(s).toContain(gate)
    // Every link to the Free swap panel sits behind that gate
    const links = s.split('/dashboard/settings#free-plan').length - 1
    expect(links).toBe(1)
    expect(s.indexOf(gate)).toBeLessThan(s.indexOf('/dashboard/settings#free-plan'))
    expect(s.indexOf('/dashboard/settings#free-plan') - s.indexOf(gate)).toBeLessThan(600)
  })
})
