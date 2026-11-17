// App side of the downgrade chooser (migration 067): eligibility, limits read
// from lib/plans.ts, the two plan routes, the chooser modal, tolerance of a
// database without the new column, and the send-time SMS re-check in
// flushDueNotifications. Supabase and Twilio are mocked. The SQL itself is
// exercised for real in tests/downgrade-auto-fit.test.ts.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'fs'
import { makeFakeDb } from './helpers/fakeSupabase'

vi.mock('server-only', () => ({}))

let db = makeFakeDb()
const AGENT = 'agent-1'
const AGENT_PHONE = '+14155550100'

vi.mock('../lib/supabase-admin', () => ({ createAdminSupabase: () => db.client }))
vi.mock('../lib/supabase-server', () => ({
  createServerSupabase: () => ({
    auth: { getUser: async () => ({ data: { user: { id: AGENT } }, error: null }) },
    from: (t: string) => db.client.from(t),
    rpc: (n: string, a: unknown) => db.client.rpc(n, a),
  }),
}))
const create = vi.fn()
vi.mock('twilio', () => ({ default: vi.fn(() => ({ messages: { create } })) }))

const { choiceEligibility, choiceLimits, parseSelection, loadChoiceProfile, selectionErrorResponse } = await import('../lib/planChoice')
const planLockModule = await import('../lib/planLock')
const { selectionLimits, FREE_MAX_LISTINGS, FREE_MAX_SIGNS } = planLockModule
const { PLAN_CONFIG } = await import('../lib/plans')
const { POST: chooseFree } = await import('../app/api/plan/choose-free/route')
const { POST: freeSwap } = await import('../app/api/plan/free-swap/route')
const { GET: cronFlush } = await import('../app/api/cron/flush-notifications/route')
const { eligibleSigns, SignRow, PAUSED_PAGE_NOTE } = await import('../components/FreeSelection')
const { effectiveSignStatus, signAssignmentStatus } = await import('../lib/planChoice')
const { GET: choiceOptions } = await import('../app/api/plan/free-choice-options/route')
const { default: PlanChooser } = await import('../components/PlanChooser')
const tw = await import('../lib/twilio')

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const DAY = 86_400_000
const daysAgo = (n: number) => new Date(Date.now() - n * DAY).toISOString()
const P1 = '11111111-1111-4111-8111-111111111111'
const P2 = '22222222-2222-4222-8222-222222222222'
const P3 = '33333333-3333-4333-8333-333333333333'
const P4 = '44444444-4444-4444-8444-444444444444'

function seed(plan: string, flag: string | null) {
  db = makeFakeDb()
  db.tables.profiles = [{ id: AGENT, plan, beta_joined_at: daysAgo(400), plan_choice_required_at: flag }]
  db.tables.properties = [P1, P2, P3, P4].map((id, i) => ({
    id, user_id: AGENT, address: `${i + 1} Main St`, city: 'LA', state: 'CA', active: true, deleted_at: null,
    created_at: daysAgo(10 + i), plan_locked_at: i < 3 ? null : daysAgo(0),
  }))
  db.tables.signs = []
  db.tables.sign_assignments = []
  db.tables.scan_events = []
  db.tables.leads = []
}
const post = (body: unknown) => chooseFree(new Request('https://theqrealtor.com/api/plan/choose-free', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
}))

beforeEach(() => {
  create.mockReset().mockResolvedValue({ sid: 'SM_OK', status: 'queued' })
  process.env.TWILIO_ACCOUNT_SID = 'AC_test'
  process.env.TWILIO_AUTH_TOKEN = 'token'
  process.env.TWILIO_MESSAGING_SERVICE_SID = 'MG_test'
  for (const k of ['log', 'warn', 'error'] as const) vi.spyOn(console, k).mockImplementation(() => {})
})

describe('limits come from lib/plans.ts', () => {
  it.each(Object.keys(PLAN_CONFIG))('selectionLimits(%s) mirrors PLAN_CONFIG', plan => {
    const cfg = PLAN_CONFIG[plan as keyof typeof PLAN_CONFIG]
    expect(selectionLimits(plan)).toEqual({ maxListings: cfg.maxActiveListings, maxSigns: cfg.maxActiveSigns })
  })
  it('unknown plans resolve to Free; FREE_MAX_* are derived, not hard-coded', () => {
    expect(selectionLimits('bogus')).toEqual(selectionLimits('free'))
    expect([FREE_MAX_LISTINGS, FREE_MAX_SIGNS]).toEqual([PLAN_CONFIG.free.maxActiveListings, PLAN_CONFIG.free.maxActiveSigns])
    expect(src('lib/planLock.ts')).not.toMatch(/FREE_MAX_LISTINGS = 1|FREE_MAX_SIGNS = 3/)
    expect(src('components/FreeSelection.tsx')).not.toContain('FREE_MAX_')
  })
  it('the expired-trial choice uses Free limits; a downgrade uses the current plan', () => {
    expect(choiceLimits('choose', 'trial')).toEqual(selectionLimits('free'))
    expect(choiceLimits('downgrade', 'starter')).toEqual({ maxListings: 3, maxSigns: 15 })
  })
})

describe('choiceEligibility', () => {
  it("'downgrade' while the flag is set — on any non-exempt plan, ahead of swap", () => {
    expect(choiceEligibility('starter', daysAgo(1), daysAgo(0))).toBe('downgrade')
    expect(choiceEligibility('free', daysAgo(1), daysAgo(0))).toBe('downgrade')
    expect(choiceEligibility('free', daysAgo(1), null)).toBe('swap')
  })
  it('founding/alpha never get the downgrade chooser, even with the flag set', () => {
    expect(choiceEligibility('alpha', daysAgo(400), daysAgo(0))).toBeNull()
    expect(choiceEligibility('founding', daysAgo(400), daysAgo(0))).toBeNull()
  })
})

describe('parseSelection with a plan’s limits', () => {
  it('Starter takes up to 3 listings and 15 signs; more is refused before the database', () => {
    const lim = selectionLimits('starter')
    expect(parseSelection({ listingIds: [P1, P2, P3], signIds: [] }, lim, 'Starter')).toMatchObject({ ok: true, listingIds: [P1, P2, P3] })
    const r = parseSelection({ listingIds: [P1, P2, P3, P4], signIds: [] }, lim, 'Starter')
    expect(r).toEqual({ ok: false, error: 'Starter keeps up to 3 listings active. Choose 3 or fewer.' })
    expect(parseSelection({ listingIds: [], signIds: Array.from({ length: 16 }, (_, i) => `s${i}`) }, lim, 'Starter').ok).toBe(false)
  })
  it('Free default is unchanged', () => {
    expect(parseSelection({ listingIds: [P1, P2] })).toEqual({ ok: false, error: 'Free keeps 1 listing active. Choose one.' })
  })
  it('maps the new SQL refusals', () => {
    expect(selectionErrorResponse('too_many_listings').status).toBe(400)
    expect(selectionErrorResponse('no_choice_pending').status).toBe(409)
    expect(selectionErrorResponse('exempt_plan').status).toBe(409)
  })
})

describe('GET /api/plan/free-choice-options', () => {
  it('downgraded Starter agent: mode downgrade with Starter limits and name', async () => {
    seed('starter', daysAgo(0))
    const body = await (await choiceOptions()).json()
    expect(body).toMatchObject({ mode: 'downgrade', planName: 'Starter', limits: { maxListings: 3, maxSigns: 15 } })
    expect(body.listings).toHaveLength(4)
  })
  it('Starter without the flag: refused (no swap for paid agents)', async () => {
    seed('starter', null)
    expect((await choiceOptions()).status).toBe(403)
  })
})

describe('POST /api/plan/choose-free in downgrade mode', () => {
  it('calls apply_plan_selection with the full selection (several listings), never apply_free_selection', async () => {
    seed('starter', daysAgo(0))
    db.rpcs.apply_plan_selection = () => ({ data: { plan: 'starter' } })
    const res = await post({ listingIds: [P1, P2, P4], signIds: ['s1'] })
    expect(res.status).toBe(200)
    expect(db.rpcCalls).toEqual([{ name: 'apply_plan_selection', args: { p_agent: AGENT, p_listings: [P1, P2, P4], p_signs: ['s1'] } }])
  })
  it('over the plan’s limits: 400 without touching the database', async () => {
    seed('starter', daysAgo(0))
    expect((await post({ listingIds: [P1, P2, P3, P4], signIds: [] })).status).toBe(400)
    expect(db.rpcCalls).toEqual([])
  })
  it('a Free agent with the flag set gets the free post-downgrade choice, not a counted swap', async () => {
    seed('free', daysAgo(0))
    db.rpcs.apply_plan_selection = () => ({ data: { plan: 'free' } })
    expect((await post({ listingIds: [P2], signIds: [] })).status).toBe(200)
    expect(db.rpcCalls[0].name).toBe('apply_plan_selection')
  })
  it('the expired-trial path is unchanged', async () => {
    seed('trial', null)
    db.tables.profiles[0].beta_joined_at = daysAgo(46)
    db.rpcs.apply_free_selection = () => ({ data: { plan: 'free' } })
    expect((await post({ listingIds: [P1], signIds: [] })).status).toBe(200)
    expect(db.rpcCalls).toEqual([{ name: 'apply_free_selection', args: { p_agent: AGENT, p_mode: 'choose', p_listing: P1, p_signs: [] } }])
  })
})

describe('before migration 067 is applied (no plan_choice_required_at column)', () => {
  // Minimal client: errors like PostgREST does when a selected column is missing.
  const client = (row: Record<string, unknown>) => ({
    from: () => {
      let cols = ''
      const q: any = {
        select: (c: string) => { cols = c; return q },
        eq: () => q,
        maybeSingle: async () => cols.includes('plan_choice_required_at')
          ? { data: null, error: { code: '42703', message: 'column profiles.plan_choice_required_at does not exist' } }
          : { data: row, error: null },
      }
      return q
    },
  })
  it('loadChoiceProfile re-reads without the column and reports no pending choice', async () => {
    expect(await loadChoiceProfile(client({ plan: 'free', beta_joined_at: null }), AGENT))
      .toEqual({ plan: 'free', beta_joined_at: null, plan_choice_required_at: null })
  })
  it('DashboardLayout uses the shared loadChoiceProfile (one copy of the fallback)', () => {
    const dl = src('components/DashboardLayout.tsx')
    expect(dl).toContain('loadChoiceProfile(supabase, session.user.id)')
    expect(dl).not.toContain('isMissingColumn')
    expect(dl).not.toContain("select('plan, beta_joined_at")
  })
})

describe('chooser modal: downgrade variant', () => {
  it('goes straight to "choose what stays active" with no plan cards, and never shows Free’s numbers before loading', () => {
    const html = renderToStaticMarkup(createElement(PlanChooser, { onClose: () => {}, variant: 'downgrade' }))
    expect(html).toContain('Choose what stays active.')
    expect(html).not.toMatch(/data-plan-card=/)
    expect(html).not.toContain('Free keeps')
  })
  it('the trial variant is unchanged (three plan cards)', () => {
    const html = renderToStaticMarkup(createElement(PlanChooser, { onClose: () => {} }))
    expect(html.match(/data-plan-card=/g)).toHaveLength(3)
  })
  it('copy never says "unlimited"', () => {
    for (const f of ['components/FreeSelection.tsx', 'components/PlanChooser.tsx']) {
      expect(src(f).toLowerCase()).not.toContain('unlimited')
    }
  })
})

describe('flushDueNotifications re-checks plan and SMS toggle at send time', () => {
  const due = (id: string) => ({ id, agent_id: AGENT, message: 'queued showing alert', scheduled_for: new Date(Date.now() - 60_000).toISOString(), sent_at: null })
  const profile = (extra: Record<string, unknown>) => { db = makeFakeDb(); db.tables.profiles = [{ id: AGENT, phone: AGENT_PHONE, ...extra }] }

  it('Free agent (downgraded while the text waited out quiet hours): dropped, marked handled, not retried', async () => {
    profile({ plan: 'free', sms_alerts_enabled: true })
    db.tables.pending_notifications = [due('n1')]
    const r = await tw.flushDueNotifications(db.client)
    expect(r).toMatchObject({ processed: 1, sent: 0, planRestricted: 1 })
    expect(create).not.toHaveBeenCalled()
    expect(db.tables.pending_notifications[0].sent_at).toBeTruthy()
    expect((await tw.flushDueNotifications(db.client)).processed).toBe(0)
  })

  it('paid agent with SMS alerts switched off: dropped the same way', async () => {
    profile({ plan: 'pro', sms_alerts_enabled: false })
    db.tables.pending_notifications = [due('n2')]
    expect(await tw.flushDueNotifications(db.client)).toMatchObject({ sent: 0, planRestricted: 1 })
    expect(create).not.toHaveBeenCalled()
  })

  it('paid agent with SMS alerts on: still sent', async () => {
    profile({ plan: 'starter', sms_alerts_enabled: true })
    db.tables.pending_notifications = [due('n3')]
    expect(await tw.flushDueNotifications(db.client)).toMatchObject({ sent: 1, planRestricted: 0 })
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('profile lookup error: left queued for the next flush, not sent, not dropped', async () => {
    profile({ plan: 'pro', sms_alerts_enabled: true })
    db.tables.pending_notifications = [due('n4')]
    db.failReads.add('profiles')
    expect(await tw.flushDueNotifications(db.client)).toMatchObject({ sent: 0, failed: 1, planRestricted: 0 })
    expect(db.tables.pending_notifications[0].sent_at).toBeNull()
    expect(create).not.toHaveBeenCalled()
  })
})

describe('review fix 2 (app): paid plans offer every unarchived sign', () => {
  it('options say freeRule=false for a downgraded Starter agent, true on Free', async () => {
    seed('starter', daysAgo(0))
    expect((await (await choiceOptions()).json()).freeRule).toBe(false)
    seed('free', daysAgo(0))
    expect((await (await choiceOptions()).json()).freeRule).toBe(true)
  })
  it('eligibleSigns(…, includeOthers) adds signs on paused/offline/unchosen listings; Free stays strict', () => {
    const mk = (id: string, assignedPropertyId: string | null) =>
      ({ id, label: id, locked: false, assignedPropertyId, assignmentStatus: (assignedPropertyId ? 'live' : 'unassigned') as 'live' | 'unassigned', scans30: 0, leads30: 0, lastActivityAt: daysAgo(1) })
    const signs = [mk('on', P1), mk('loose', null), mk('offline', P4)]
    expect(eligibleSigns(signs, [P1]).other).toEqual([])
    expect(eligibleSigns(signs, [P1], true).other.map(s => s.id)).toEqual(['offline'])
  })
})

describe('review fix 3: the Settings swap saves the free post-downgrade choice while it is pending', () => {
  const swap = (body: unknown) => freeSwap(new Request('https://theqrealtor.com/api/plan/free-swap', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  }))
  it('flag set: apply_plan_selection (no swap clock), never apply_free_selection swap', async () => {
    seed('free', daysAgo(0))
    db.rpcs.apply_plan_selection = () => ({ data: { plan: 'free' } })
    expect((await swap({ listingIds: [P2], signIds: [] })).status).toBe(200)
    expect(db.rpcCalls).toEqual([{ name: 'apply_plan_selection', args: { p_agent: AGENT, p_listings: [P2], p_signs: [] } }])
  })
  it('flag not set: the normal counted swap', async () => {
    seed('free', null)
    db.rpcs.apply_free_selection = () => ({ data: { plan: 'free' } })
    expect((await swap({ listingIds: [P2], signIds: [] })).status).toBe(200)
    expect(db.rpcCalls[0]).toMatchObject({ name: 'apply_free_selection', args: { p_mode: 'swap' } })
  })
  it('the Settings screen follows the server’s mode for copy and endpoint', () => {
    const fs = src('components/FreeSelection.tsx')
    expect(fs).toContain('const effMode: Mode = opts?.mode ?? mode')
    expect(fs).toContain("fetch(effMode === 'swap' ? '/api/plan/free-swap' : '/api/plan/choose-free'")
  })
})

describe('review fixes 5–7', () => {
  const due = (id: string, ageDays: number) => ({ id, agent_id: AGENT, message: 'queued showing alert', scheduled_for: new Date(Date.now() - ageDays * DAY).toISOString(), sent_at: null })

  it('5: entitlement lookup still failing after 3 days → given up (abandoned), never sent late', async () => {
    db = makeFakeDb()
    db.tables.profiles = [{ id: AGENT, phone: AGENT_PHONE, plan: 'pro', sms_alerts_enabled: true }]
    db.tables.pending_notifications = [due('old', 4), due('fresh', 0.01)]
    db.failReads.add('profiles')
    const r = await tw.flushDueNotifications(db.client)
    expect(r).toMatchObject({ abandoned: 1, failed: 1, sent: 0 })
    expect(db.tables.pending_notifications.find((n: any) => n.id === 'old')!.sent_at).toBeTruthy()
    expect(db.tables.pending_notifications.find((n: any) => n.id === 'fresh')!.sent_at).toBeNull()
    expect(create).not.toHaveBeenCalled()
  })

  it('6: the cron summary counts plan-restricted and suppressed texts, so the outcomes add up', async () => {
    delete process.env.CRON_SECRET
    db = makeFakeDb()
    db.tables.profiles = [{ id: AGENT, phone: AGENT_PHONE, plan: 'free', sms_alerts_enabled: true }]
    db.tables.pending_notifications = [due('n1', 0.01), due('n2', 0.01)]
    const body = await (await cronFlush(new Request('https://theqrealtor.com/api/cron/flush-notifications'))).json()
    expect(body).toMatchObject({ processed: 2, sent: 0, failed: 0, abandoned: 0, suppressed: 0, planRestricted: 2 })
    expect(src('app/api/notifications/flush-due/route.ts')).toContain('suppressed, planRestricted')
  })

  it('7: the chooser fallback limits come from lib/plans.ts', () => {
    expect(src('components/FreeSelection.tsx')).toContain("const FREE_LIMITS: SelectionLimits = selectionLimits('free')")
  })
})

describe('chooser options: each sign carries its current assignment status', () => {
  const OTHER_AGENT = 'agent-2'
  const P_OFF = '55555555-5555-4555-8555-555555555555'
  const P_DEL = '66666666-6666-4666-8666-666666666666'
  const P_FOREIGN = '77777777-7777-4777-8777-777777777777'

  const setup = () => {
    seed('starter', daysAgo(0))                 // P1..P3 live, P4 plan-locked
    db.tables.properties.push(
      { id: P_OFF, user_id: AGENT, address: 'Offline', city: 'LA', state: 'CA', active: false, deleted_at: null, created_at: daysAgo(5), plan_locked_at: null },
      { id: P_DEL, user_id: AGENT, address: 'Deleted', city: 'LA', state: 'CA', active: true, deleted_at: daysAgo(1), created_at: daysAgo(5), plan_locked_at: null },
      { id: P_FOREIGN, user_id: OTHER_AGENT, address: 'Not mine', city: 'LA', state: 'CA', active: true, deleted_at: null, created_at: daysAgo(5), plan_locked_at: null },
    )
    const mk = (id: string, agent = AGENT) => ({ id, agent_id: agent, label: id, archived_at: null, plan_locked_at: null, created_at: daysAgo(3) })
    db.tables.signs = ['sLive', 'sLocked', 'sOffline', 'sDeleted', 'sNone', 'sForeign'].map(id => mk(id))
    db.tables.sign_assignments = [
      { sign_id: 'sLive', property_id: P1, unassigned_at: null },
      { sign_id: 'sLocked', property_id: P4, unassigned_at: null },
      { sign_id: 'sOffline', property_id: P_OFF, unassigned_at: null },
      { sign_id: 'sDeleted', property_id: P_DEL, unassigned_at: null },
      { sign_id: 'sForeign', property_id: P_FOREIGN, unassigned_at: null },
      // sNone: no row; and an old, ended assignment must not count
      { sign_id: 'sNone', property_id: P2, unassigned_at: daysAgo(2) },
    ]
  }
  const status = async () => {
    const body = await (await choiceOptions()).json()
    return Object.fromEntries(body.signs.map((x: any) => [x.id, x.assignmentStatus]))
  }

  it('live / paused (plan-locked) / paused (inactive) / paused (deleted) / unassigned', async () => {
    setup()
    expect(await status()).toMatchObject({
      sLive: 'live', sLocked: 'paused', sOffline: 'paused', sDeleted: 'paused', sNone: 'unassigned',
    })
  })

  it('a sign on a listing the agent does not own is never "live" (scoped to the session user)', async () => {
    setup()
    expect((await status()).sForeign).toBe('paused')
  })

  it('signAssignmentStatus is a pure rule', () => {
    const ok = { active: true, deleted_at: null, plan_locked_at: null }
    expect(signAssignmentStatus(null, undefined)).toBe('unassigned')
    expect(signAssignmentStatus(P1, ok)).toBe('live')
    expect(signAssignmentStatus(P1, { ...ok, plan_locked_at: 'x' })).toBe('paused')
    expect(signAssignmentStatus(P1, { ...ok, active: false })).toBe('paused')
    expect(signAssignmentStatus(P1, { ...ok, active: null })).toBe('paused')
    expect(signAssignmentStatus(P1, { ...ok, deleted_at: 'x' })).toBe('paused')
    expect(signAssignmentStatus(P1, undefined)).toBe('paused')
  })
})

describe('effective status in the chooser', () => {
  it('a paused sign whose listing is selected in the same chooser counts as live', () => {
    const paused = { assignmentStatus: 'paused' as const, assignedPropertyId: P4 }
    expect(effectiveSignStatus(paused, [])).toBe('paused')
    expect(effectiveSignStatus(paused, [P1])).toBe('paused')
    expect(effectiveSignStatus(paused, [P1, P4])).toBe('live')
  })
  it('unassigned stays unassigned; live stays live; an older API without the field shows nothing', () => {
    expect(effectiveSignStatus({ assignmentStatus: 'unassigned', assignedPropertyId: null }, [P1])).toBe('unassigned')
    expect(effectiveSignStatus({ assignmentStatus: 'live', assignedPropertyId: P1 }, [])).toBe('live')
    expect(effectiveSignStatus({ assignedPropertyId: P1 }, [P1])).toBeNull()
  })
})

describe('SignRow: the "Buyers will see a paused page" tag', () => {
  const render = (status: 'live' | 'paused' | 'unassigned' | null, extra: Record<string, unknown> = {}) =>
    renderToStaticMarkup(createElement(SignRow, {
      sign: { id: 's', label: 'Open House Sign', scans30: 2, leads30: 1 },
      selected: false, disabled: false, recommended: false, status, onToggle: () => {}, ...extra,
    }))

  it('renders for paused and unassigned only', () => {
    expect(render('paused')).toContain(PAUSED_PAGE_NOTE)
    expect(render('unassigned')).toContain(PAUSED_PAGE_NOTE)
    expect(render('live')).not.toContain(PAUSED_PAGE_NOTE)
    expect(render(null)).not.toContain(PAUSED_PAGE_NOTE)
    expect(PAUSED_PAGE_NOTE).toBe('Buyers will see a paused page')
  })

  it('selection is still allowed: the row stays enabled and can be checked with the tag showing', () => {
    const html = render('paused', { selected: true })
    expect(html).toContain('aria-checked="true"')
    expect(html).not.toMatch(/<button[^>]*disabled/)
    expect(html).toContain(PAUSED_PAGE_NOTE)
  })

  it('the rest of the row is unchanged (label, activity line, Recommended tag)', () => {
    const html = render('paused', { recommended: true })
    expect(html).toContain('Open House Sign')
    expect(html).toContain('2 scans · 1 lead in the last 30 days')
    expect(html).toContain('Recommended')
  })

  it('FreeSelection renders every sign through SignRow with the effective status', () => {
    const fs = src('components/FreeSelection.tsx')
    expect(fs).toContain('status={effectiveSignStatus(s, listingIds)}')
  })
})

describe('rankByActivity mirrors the database fit: signs behind a paused listing rank last', () => {
  const { rankByActivity } = planLockModule
  const stat = (id: string, scans30: number, extra: Record<string, unknown> = {}) =>
    ({ id, scans30, leads30: 0, lastActivityAt: daysAgo(1), ...extra })

  it('a paused-listing sign with higher or equal activity ranks after a live one', () => {
    const ranked = rankByActivity([
      stat('deadBusy', 50, { behindPausedListing: true }),
      stat('liveQuiet', 1),
      stat('deadEqual', 1, { behindPausedListing: true }),
      stat('liveBusy', 9),
    ])
    expect(ranked.map(x => x.id)).toEqual(['liveBusy', 'liveQuiet', 'deadBusy', 'deadEqual'])
  })
  it('without the flag (listings, unassigned signs) the order is the old activity ranking', () => {
    expect(rankByActivity([stat('a', 1), stat('b', 9), stat('c', 5)]).map(x => x.id)).toEqual(['b', 'c', 'a'])
  })

  const mk = (id: string, assignedPropertyId: string | null, assignmentStatus: 'live' | 'paused' | 'unassigned', scans30: number) =>
    ({ id, label: id, locked: false, assignedPropertyId, assignmentStatus, scans30, leads30: 0, lastActivityAt: daysAgo(1) })

  it('the chooser orders signs the same way: paused-listing signs last, unassigned not demoted', () => {
    const signs = [mk('onDead', P4, 'paused', 40), mk('onLive', P2, 'live', 1), mk('loose', null, 'unassigned', 0), mk('onLive2', P2, 'live', 2)]
    const { other, unassigned } = eligibleSigns(signs, [P1], true)
    expect(other.map(x => x.id)).toEqual(['onLive2', 'onLive', 'onDead'])
    expect(unassigned.map(x => x.id)).toEqual(['loose'])
  })
  it('a paused sign whose listing is chosen here counts as live, so it is not demoted', () => {
    const signs = [mk('onChosen', P4, 'paused', 40), mk('onLive', P4, 'live', 1)]
    expect(eligibleSigns(signs, [P4]).onListing.map(x => x.id)).toEqual(['onChosen', 'onLive'])
  })
})
