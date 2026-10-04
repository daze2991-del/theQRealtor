// Step 6: dashboard "Texts off" display, filter, admin list, and the agent's
// own "alerts paused" banner. Supabase is mocked — no live data, no texts.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { makeFakeDb } from './helpers/fakeSupabase'

vi.mock('server-only', () => ({}))
vi.mock('twilio', () => ({ default: vi.fn(), validateRequest: vi.fn() }))

// The agent's own session client. Deliberately WITHOUT row-level security: it
// holds two agents' leads, so if the route forgot to scope to the signed-in
// agent, the other agent's lead would leak and these tests would fail.
let sessionDb = makeFakeDb()
let sessionUser: { id: string } | null = null
vi.mock('../lib/supabase-server', () => ({
  createServerSupabase: () => ({
    auth: { getUser: async () => ({ data: { user: sessionUser } }) },
    from: (t: string) => sessionDb.client.from(t),
  }),
}))

// Service-role client: sms_contacts + the agent's alert-number lookup.
let adminDb = makeFakeDb()
vi.mock('../lib/supabase-admin', () => ({ createAdminSupabase: () => adminDb.client }))

// God Mode.
let svcDb = makeFakeDb()
vi.mock('../lib/supabase-service', () => ({ createServiceSupabase: () => svcDb.client }))
let isAdmin = true
vi.mock('../lib/admin/auth', () => {
  class AdminForbidden extends Error {}
  return {
    AdminForbidden,
    assertAdmin: async () => { if (!isAdmin) throw new AdminForbidden(); return 'admin-id' },
  }
})

const { GET } = await import('../app/api/sms/opt-out-status/route')
const { filterTextsOffLeads, TEXTS_OFF_TOOLTIP, ALERTS_PAUSED_BANNER } = await import('../lib/textsOff')
const { default: TextsOffBadge } = await import('../components/TextsOffBadge')
const { getSmsOptOutOverview } = await import('../lib/admin/smsOptOuts')
const { default: SmsOptOutsPanel } = await import('../components/admin/SmsOptOutsPanel')

const AGENT_A = 'agent-a'
const AGENT_B = 'agent-b'
const A_PHONE = '+14155550100'
const OPTED_OUT_BUYER = '+13105550142'
const OK_BUYER = '+13105550143'
const B_OPTED_OUT_BUYER = '+12125550199'

function seed() {
  sessionDb = makeFakeDb()
  adminDb = makeFakeDb()
  sessionDb.tables.leads = [
    { id: 'L1', agent_id: AGENT_A, phone_e164: OPTED_OUT_BUYER },
    { id: 'L2', agent_id: AGENT_A, phone_e164: OK_BUYER },
    { id: 'L3', agent_id: AGENT_A, phone_e164: null },
    { id: 'L4', agent_id: AGENT_A, phone_e164: OPTED_OUT_BUYER },   // same buyer, second listing
    { id: 'LB1', agent_id: AGENT_B, phone_e164: B_OPTED_OUT_BUYER },
  ]
  adminDb.tables.sms_contacts = [
    { phone_e164: OPTED_OUT_BUYER, status: 'opted_out' },
    { phone_e164: OK_BUYER, status: 'opted_in' },
    { phone_e164: B_OPTED_OUT_BUYER, status: 'opted_out' },
  ]
  adminDb.tables.profiles = [{ id: AGENT_A, phone: A_PHONE }, { id: AGENT_B, phone: '+14155550101' }]
  adminDb.tables.properties = []
  sessionUser = { id: AGENT_A }
}

async function status() {
  const res = await GET()
  return { res, body: await res.json() }
}

beforeEach(() => {
  seed()
  isAdmin = true
  svcDb = makeFakeDb()
  for (const k of ['log', 'warn', 'error'] as const) vi.spyOn(console, k).mockImplementation(() => {})
})

// ── Part 1 + 4: the status route ──────────────────────────────────────────────
describe('GET /api/sms/opt-out-status', () => {
  it('flags only the agent\'s own leads whose number is opted out', async () => {
    const { res, body } = await status()
    expect(res.status).toBe(200)
    expect([...body.textsOffLeadIds].sort()).toEqual(['L1', 'L4'])
  })

  it("never includes another agent's leads, even when their buyer is opted out", async () => {
    const { body } = await status()
    expect(body.textsOffLeadIds).not.toContain('LB1')
  })

  it('returns only lead ids and one boolean — no phone numbers, no sms_contacts rows', async () => {
    const { res, body } = await status()
    expect(Object.keys(body).sort()).toEqual(['ownAlertsPaused', 'textsOffLeadIds'])
    const raw = JSON.stringify(body)
    for (const n of [OPTED_OUT_BUYER, OK_BUYER, B_OPTED_OUT_BUYER, A_PHONE]) expect(raw).not.toContain(n.slice(-10))
    expect(res.headers.get('cache-control')).toBe('no-store')
  })

  it('only ever looks up the agent\'s own numbers in sms_contacts (no arbitrary probing)', async () => {
    await status()
    const lookups = adminDb.queries.filter(q => q.table === 'sms_contacts').flatMap(q => q.filters).join(' ')
    expect(lookups).toContain(OPTED_OUT_BUYER)
    expect(lookups).toContain(A_PHONE)
    expect(lookups).not.toContain(B_OPTED_OUT_BUYER)
    // The route takes no input: GET() has no request parameter to smuggle a number through.
    expect(GET.length).toBe(0)
  })

  it('401 when signed out, and nothing is looked up', async () => {
    sessionUser = null
    const { res } = await status()
    expect(res.status).toBe(401)
    expect(adminDb.queries).toEqual([])
  })

  it('500 with no partial data when the opt-out lookup fails', async () => {
    adminDb.failReads.add('sms_contacts')
    const { res, body } = await status()
    expect(res.status).toBe(500)
    expect(body.textsOffLeadIds).toBeUndefined()
  })

  it('banner flag: false when the agent\'s own number is not opted out', async () => {
    expect((await status()).body.ownAlertsPaused).toBe(false)
  })

  it('banner flag: true when the agent\'s own number is opted out', async () => {
    adminDb.tables.sms_contacts.push({ phone_e164: A_PHONE, status: 'opted_out' })
    expect((await status()).body.ownAlertsPaused).toBe(true)
  })

  it('banner flag: false when the agent\'s number opted back in', async () => {
    adminDb.tables.sms_contacts.push({ phone_e164: A_PHONE, status: 'opted_in' })
    expect((await status()).body.ownAlertsPaused).toBe(false)
  })

  it("banner uses the number alerts actually go to, normalized like buyer numbers", async () => {
    // No profile phone → alerts fall back to properties.agent_phone (raw format).
    adminDb.tables.profiles = [{ id: AGENT_A, phone: null }]
    adminDb.tables.properties = [{ user_id: AGENT_A, agent_phone: '(415) 555-0100' }]
    adminDb.tables.sms_contacts.push({ phone_e164: A_PHONE, status: 'opted_out' })
    expect((await status()).body.ownAlertsPaused).toBe(true)
  })

  it("another agent's opted-out alert number doesn't pause this agent", async () => {
    adminDb.tables.sms_contacts.push({ phone_e164: '+14155550101', status: 'opted_out' })
    expect((await status()).body.ownAlertsPaused).toBe(false)
  })
})

// ── Part 2: filter ────────────────────────────────────────────────────────────
describe('filterTextsOffLeads', () => {
  const leads = [{ id: 'L1' }, { id: 'L2' }, { id: 'L3' }, { id: 'L4' }]
  const off = new Set(['L1', 'L4'])
  it('on → only "Texts off" leads', () => {
    expect(filterTextsOffLeads(leads, off, true).map(l => l.id)).toEqual(['L1', 'L4'])
  })
  it('off → unchanged', () => {
    expect(filterTextsOffLeads(leads, off, false)).toBe(leads)
  })
  it('on with nothing opted out → empty', () => {
    expect(filterTextsOffLeads(leads, new Set(), true)).toEqual([])
  })
})

// ── Badge + wording ───────────────────────────────────────────────────────────
describe('TextsOffBadge and wording', () => {
  it('exact tooltip and banner wording', () => {
    expect(TEXTS_OFF_TOOLTIP).toBe("This buyer replied STOP. theQRealtor won't text them. You can still call or email.")
    expect(ALERTS_PAUSED_BANNER).toBe('Your text alerts are paused because this number replied STOP to theQRealtor. Text START to (620) 522-8398 to turn them back on.')
  })
  it('renders "Texts off" with the tooltip as hover and screen-reader text', () => {
    const html = renderToStaticMarkup(createElement(TextsOffBadge))
    expect(html).toContain('Texts off')
    expect(html).toContain('title="This buyer replied STOP. theQRealtor won&#x27;t text them. You can still call or email."')
    expect(html).toContain('You can still call or email.</span>')
  })
})

// ── Part 3: God Mode ──────────────────────────────────────────────────────────
describe('admin SMS opt-out overview', () => {
  function seedEvents() {
    svcDb.tables.sms_contacts = [
      { phone_e164: '+13105550142', status: 'opted_out' },
      { phone_e164: '+13105550143', status: 'opted_out' },
      { phone_e164: '+13105550144', status: 'opted_in' },
    ]
    svcDb.tables.sms_consent_events = [
      { id: 'e1', phone_e164: '+13105550142', event_type: 'opt_out', agent_id: null, received_at: '2026-10-01T10:00:00Z' },
      { id: 'e2', phone_e164: '+13105550144', event_type: 'opt_in', agent_id: null, received_at: '2026-10-02T10:00:00Z' },
      { id: 'e3', phone_e164: '+13105550145', event_type: 'opt_out', agent_id: AGENT_A, received_at: '2026-10-03T10:00:00Z' },
      { id: 'e4', phone_e164: '+13105550146', event_type: 'help', agent_id: null, received_at: '2026-10-04T10:00:00Z' },
    ]
  }

  it('lists only unmatched opt-out/opt-in events, newest first, masked to last 4', async () => {
    seedEvents()
    const data = await getSmsOptOutOverview()
    expect(data.optedOutCount).toBe(2)
    expect(data.unmatchedEvents).toEqual([
      { id: 'e2', phoneLast4: '0144', eventType: 'opt_in', receivedAt: '2026-10-02T10:00:00Z' },
      { id: 'e1', phoneLast4: '0142', eventType: 'opt_out', receivedAt: '2026-10-01T10:00:00Z' },
    ])
  })

  it('never returns a full phone number', async () => {
    seedEvents()
    const raw = JSON.stringify(await getSmsOptOutOverview())
    expect(raw).not.toMatch(/\+?1?\d{10}/)
    expect(raw).not.toContain('310555')
  })

  it('rendered panel shows only ***-***-last4', async () => {
    seedEvents()
    const html = renderToStaticMarkup(createElement(SmsOptOutsPanel, { data: await getSmsOptOutOverview() }))
    expect(html).toContain('***-***-0142')
    expect(html).not.toContain('3105550142')
    expect(html).toContain('Numbers currently opted out: <strong')
  })

  it('blocked for non-admins — throws before touching the database', async () => {
    seedEvents()
    isAdmin = false
    await expect(getSmsOptOutOverview()).rejects.toThrow()
    expect(svcDb.queries).toEqual([])
  })
})
