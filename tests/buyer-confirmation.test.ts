// Step 5: buyer confirmation wording, when it's sent, and recording which of
// our numbers sent it. Supabase and Twilio are mocked — no real texts, no live
// leads.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeFakeDb } from './helpers/fakeSupabase'

let db = makeFakeDb()
vi.mock('../lib/supabase-admin', () => ({ createAdminSupabase: () => db.client }))

const create = vi.fn()
vi.mock('twilio', () => ({ default: vi.fn(() => ({ messages: { create } })) }))

const { msg } = await import('../lib/twilio')
const { POST } = await import('../app/api/submit-lead/route')

const AGENT_ID = 'agent-1'
const AGENT_PHONE = '+14155550100'
const BUYER_RAW = '(310) 555-0142'
const BUYER_E164 = '+13105550142'
const OUR_NUMBER = '+16205228398'

// ── Exact wording ─────────────────────────────────────────────────────────────
describe('msg.buyerConfirmation wording', () => {
  it('showing', () => {
    expect(msg.buyerConfirmation('showing', '4444 Culver Blvd', 'Jane Smith')).toBe(
      'theqrealtor: Your showing request for 4444 Culver Blvd was sent to Jane Smith, who will contact you soon. Reply STOP to opt out.',
    )
  })

  it('question', () => {
    expect(msg.buyerConfirmation('question', '4444 Culver Blvd', 'Jane Smith')).toBe(
      'theqrealtor: Your question about 4444 Culver Blvd was sent to Jane Smith, who will contact you soon. Reply STOP to opt out.',
    )
  })

  it.each([null, undefined, '', '   '])('address %j → "this property"', a => {
    expect(msg.buyerConfirmation('showing', a, 'Jane Smith')).toBe(
      'theqrealtor: Your showing request for this property was sent to Jane Smith, who will contact you soon. Reply STOP to opt out.',
    )
  })

  it.each([null, undefined, '', '  '])('agent name %j → "the listing agent"', n => {
    expect(msg.buyerConfirmation('question', '4444 Culver Blvd', n)).toBe(
      'theqrealtor: Your question about 4444 Culver Blvd was sent to the listing agent, who will contact you soon. Reply STOP to opt out.',
    )
  })

  it('trims whitespace and keeps the full agent display name (not just the first name)', () => {
    expect(msg.buyerConfirmation('showing', '  4444 Culver Blvd  ', '  Jane Q. Smith ')).toContain(
      'for 4444 Culver Blvd was sent to Jane Q. Smith,',
    )
  })

  it('typical examples fit in one 160-character GSM-7 segment', () => {
    const showing = msg.buyerConfirmation('showing', '4444 Culver Blvd', 'Jane Smith')
    const question = msg.buyerConfirmation('question', '4444 Culver Blvd', 'Jane Smith')
    expect(showing.length).toBe(128)
    expect(question.length).toBe(123)
    expect(msg.buyerConfirmation('showing', null, null).length).toBe(132)   // both fallbacks
    // Plain GSM-7 characters only (no curly quotes / emoji that force UCS-2's 70-char segments).
    expect(/^[A-Za-z0-9 .,:']*$/.test(showing + question)).toBe(true)
  })
})

// ── submit-lead ───────────────────────────────────────────────────────────────
function seed(prop: { address?: string | null; agent_name?: string | null } = {}) {
  db.tables.properties = [{
    id: 'P1', address: '4444 Culver Blvd', agent_name: 'Jane Smith', agent_phone: null, active: true, user_id: AGENT_ID, ...prop,
  }]
  db.tables.profiles = [{
    id: AGENT_ID, name: 'Jane', phone: AGENT_PHONE, notify_showing: true, notify_question: true, notify_hot_lead: true,
    quiet_hours_enabled: false, quiet_hours_start: '21:00', quiet_hours_end: '08:00', beta_joined_at: null, plan: 'founding',
  }]
}

let ip = 0
async function submit(overrides: Record<string, unknown> = {}, cta: string | null = 'showing') {
  const res = await POST(new Request('https://theqrealtor.com/api/submit-lead', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.1.0.${++ip}`, 'user-agent': 'Mozilla/5.0' },
    body: JSON.stringify({
      propertyId: 'P1', name: 'Test Buyer', phone: BUYER_RAW, motivation: 'hot', smsConsent: true,
      engagement: { ctaClicked: cta, visitCount: 1, photosViewed: 0, timeOnPageSec: 5 },
      ...overrides,
    }),
  }))
  return res
}

const buyerTexts = () => create.mock.calls.filter(c => c[0].to === BUYER_E164).map(c => c[0].body as string)
const lead = () => db.tables.leads[0]

beforeEach(() => {
  db = makeFakeDb()
  create.mockReset().mockImplementation(async ({ to }: { to: string }) => ({ sid: `SM_${to.slice(-4)}`, status: 'accepted', from: null }))
  process.env.TWILIO_ACCOUNT_SID = 'AC_test'
  process.env.TWILIO_AUTH_TOKEN = 'token'
  process.env.TWILIO_MESSAGING_SERVICE_SID = 'MG_test'
  for (const k of ['log', 'warn', 'error'] as const) vi.spyOn(console, k).mockImplementation(() => {})
})

describe('submit-lead buyer confirmation', () => {
  it('showing → exact showing wording, filled from the property row', async () => {
    seed()
    expect((await submit()).status).toBe(200)
    expect(buyerTexts()).toEqual([
      'theqrealtor: Your showing request for 4444 Culver Blvd was sent to Jane Smith, who will contact you soon. Reply STOP to opt out.',
    ])
  })

  it('question → exact question wording', async () => {
    seed()
    await submit({ motivation: 'warm' }, 'question')
    expect(buyerTexts()).toEqual([
      'theqrealtor: Your question about 4444 Culver Blvd was sent to Jane Smith, who will contact you soon. Reply STOP to opt out.',
    ])
  })

  it('missing address / agent name → fallbacks', async () => {
    seed({ address: null, agent_name: null })
    await submit()
    expect(buyerTexts()).toEqual([
      'theqrealtor: Your showing request for this property was sent to the listing agent, who will contact you soon. Reply STOP to opt out.',
    ])
  })

  it.each([
    ['no consent', { smsConsent: false }, 'showing'],
    ['no phone (email only)', { phone: undefined, email: 'b@example.com' }, 'showing'],
    ['other cta (disclosures)', {}, 'disclosures'],
    ['no cta', {}, null],
  ] as const)('%s → no buyer text, lead still saved', async (_label, overrides, cta) => {
    seed()
    const res = await submit(overrides as Record<string, unknown>, cta as string | null)
    expect(res.status).toBe(200)
    expect(buyerTexts()).toEqual([])
    expect(db.tables.leads).toHaveLength(1)
    expect(lead().buyer_texted_at).toBeUndefined()
    expect(lead().buyer_texted_from).toBeUndefined()
  })

  it('suppressed (opted out) → both columns stay unset; lead saved; response unchanged', async () => {
    seed()
    db.tables.sms_contacts = [{ phone_e164: BUYER_E164, status: 'opted_out' }]
    const res = await submit()
    expect(await res.json()).toEqual({ ok: true })
    expect(buyerTexts()).toEqual([])
    expect(db.tables.leads).toHaveLength(1)
    expect(lead().buyer_texted_at).toBeUndefined()
    expect(lead().buyer_texted_from).toBeUndefined()
  })

  it('Twilio failure → both columns stay unset', async () => {
    seed()
    create.mockImplementation(async ({ to }: { to: string }) => {
      if (to === BUYER_E164) throw Object.assign(new Error('boom'), { code: 30003 })
      return { sid: 'SM_agent', status: 'accepted', from: null }
    })
    await submit()
    expect(lead().buyer_texted_at).toBeUndefined()
    expect(lead().buyer_texted_from).toBeUndefined()
  })

  it('successful send with a Twilio-reported sender → buyer_texted_from = that number', async () => {
    seed()
    create.mockImplementation(async () => ({ sid: 'SM_ok', status: 'queued', from: OUR_NUMBER }))
    await submit()
    expect(lead().buyer_texted_at).toBeTruthy()
    expect(lead().buyer_texted_from).toBe(OUR_NUMBER)
  })

  it('successful send, sender not yet chosen (Messaging Service "accepted") → texted_at set, from NULL', async () => {
    seed()
    await submit()   // default mock: from: null
    expect(lead().buyer_texted_at).toBeTruthy()
    expect(lead().buyer_texted_from).toBeNull()
  })

  it('a non-E.164 "from" is never written (column CHECK would reject it)', async () => {
    seed()
    create.mockImplementation(async () => ({ sid: 'SM_ok', status: 'accepted', from: 'MG0123456789abcdef0123456789abcdef' }))
    await submit()
    expect(lead().buyer_texted_at).toBeTruthy()
    expect(lead().buyer_texted_from).toBeNull()
  })
})
