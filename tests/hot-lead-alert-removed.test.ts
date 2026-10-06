// The Hot-lead SMS alert is removed (final decision). Agents are texted only
// for showing requests and questions. The Hot tier itself, scoring, and
// everything else are untouched — this covers the alert text only.
// Supabase and Twilio are mocked — no real texts, no live data.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeFakeDb } from './helpers/fakeSupabase'

let db = makeFakeDb()
vi.mock('../lib/supabase-admin', () => ({ createAdminSupabase: () => db.client }))

const create = vi.fn()
vi.mock('twilio', () => ({ default: vi.fn(() => ({ messages: { create } })) }))

const tw = await import('../lib/twilio')
const { POST } = await import('../app/api/submit-lead/route')

const AGENT_ID = 'agent-1'
const AGENT_PHONE = '+14155550100'
const BUYER_PHONE = '(310) 555-0142'

function seed() {
  db = makeFakeDb()
  db.tables.properties = [{
    id: 'P1', address: '4444 Culver Blvd', agent_name: 'Jane Smith', agent_phone: null, active: true, user_id: AGENT_ID,
  }]
  db.tables.profiles = [{
    id: AGENT_ID, name: 'Jane', phone: AGENT_PHONE, notify_showing: true, notify_question: true,
    quiet_hours_enabled: false, quiet_hours_start: '21:00', quiet_hours_end: '08:00', beta_joined_at: null, plan: 'founding',
  }]
}

let ip = 0
async function submit(engagement: Record<string, unknown>, cta: string | null) {
  return POST(new Request('https://theqrealtor.com/api/submit-lead', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.2.0.${++ip}`, 'user-agent': 'Mozilla/5.0' },
    body: JSON.stringify({
      propertyId: 'P1', name: 'Test Buyer', phone: BUYER_PHONE, motivation: 'hot', smsConsent: false,
      engagement: { ctaClicked: cta, ...engagement },
    }),
  }))
}

const sentTo = () => create.mock.calls.map(c => c[0].to)

beforeEach(() => {
  seed()
  create.mockReset().mockResolvedValue({ sid: 'SM_OK', status: 'queued', from: null })
  process.env.TWILIO_ACCOUNT_SID = 'AC_test'
  process.env.TWILIO_AUTH_TOKEN = 'token'
  process.env.TWILIO_MESSAGING_SERVICE_SID = 'MG_test'
  for (const k of ['log', 'warn', 'error'] as const) vi.spyOn(console, k).mockImplementation(() => {})
})

describe('submit-lead: no Hot-lead SMS, ever', () => {
  it('heavy engagement with NO alert-eligible CTA stays below Hot and sends nothing', async () => {
    // submit-lead hardcodes hasSaved: false server-side (a separate, pre-existing
    // quirk, not touched here), so without a showing/question CTA the ceiling is
    // photos(+2) + time(+2) + returns(+5 max) = 9 → 'warm', never 'hot'. Recorded
    // here so this stays provably accurate if that quirk is ever fixed later.
    const res = await submit(
      { visitCount: 6, photosViewed: 7, totalPhotos: 0, timeOnPageSec: 95 },
      'disclosures',
    )
    expect(res.status).toBe(200)
    expect(db.tables.leads[0].tier).toBe('warm')
    expect(create).not.toHaveBeenCalled()
  })

  it('a question that ALSO crosses Hot sends exactly ONE agent SMS (not a second Hot text)', async () => {
    // question(+5) + photos(+2) + time(+2) + returns(+5) = 14 → hot.
    const res = await submit(
      { visitCount: 6, photosViewed: 7, totalPhotos: 0, timeOnPageSec: 95 },
      'question',
    )
    expect(res.status).toBe(200)
    expect(db.tables.leads[0].tier).toBe('hot')
    expect(create).toHaveBeenCalledTimes(1)
    expect(create.mock.calls[0][0].body).toContain('question')
    expect(create.mock.calls[0][0].body).not.toContain('Hot engagement')
  })

  it('a showing request that ALSO crosses Hot sends exactly ONE agent SMS (not a second Hot text)', async () => {
    const res = await submit({ visitCount: 1, photosViewed: 0, totalPhotos: 0, timeOnPageSec: 5 }, 'showing')
    expect(res.status).toBe(200)
    expect(db.tables.leads[0].tier).toBe('hot')  // a showing request alone scores +15, well past the hot threshold
    expect(create).toHaveBeenCalledTimes(1)
    expect(create.mock.calls[0][0].body).toContain('showing request')
    expect(create.mock.calls[0][0].body).not.toContain('Hot engagement')
  })

  it('a plain showing request still sends exactly one agent alert', async () => {
    await submit({ visitCount: 1, photosViewed: 0, totalPhotos: 0, timeOnPageSec: 5 }, 'showing')
    expect(sentTo()).toEqual([AGENT_PHONE])
  })

  it('a plain question still sends exactly one agent alert', async () => {
    await submit({ visitCount: 1, photosViewed: 0, totalPhotos: 0, timeOnPageSec: 5 }, 'question')
    expect(sentTo()).toEqual([AGENT_PHONE])
    expect(create.mock.calls[0][0].body).toContain('question')
  })

  it('no message template anywhere contains "Hot engagement" or a fire emoji anymore', () => {
    const haystack = Object.values(tw.msg).map(fn => (typeof fn === 'function' ? String(fn) : '')).join('\n')
    expect(haystack).not.toContain('Hot engagement')
    expect(haystack).not.toContain('🔥')
  })

  it('msg has no hotAlert / hotAlertTeaser export', () => {
    expect('hotAlert' in tw.msg).toBe(false)
    expect('hotAlertTeaser' in tw.msg).toBe(false)
  })
})

describe('flushDueNotifications: a queued Hot alert is never sent', () => {
  beforeEach(() => {
    db.tables.profiles = [{ id: AGENT_ID, phone: AGENT_PHONE }]
  })

  it('a pre-existing queued Hot-alert-shaped message is marked handled, never sent', async () => {
    db.tables.pending_notifications = [{
      id: 'n1', agent_id: AGENT_ID,
      message: '🔥 Test Buyer just hit Hot engagement on 4444 Culver Blvd. Phone: n/a. View lead: https://x. Reply STOP to opt out.',
      scheduled_for: new Date(Date.now() - 60_000).toISOString(), sent_at: null,
    }]
    const result = await tw.flushDueNotifications(db.client)
    expect(create).not.toHaveBeenCalled()
    expect(db.tables.pending_notifications[0].sent_at).toBeTruthy()
    expect(result.sent).toBe(0)
    const again = await tw.flushDueNotifications(db.client)   // not retried either
    expect(again.processed).toBe(0)
  })

  it('a queued Hot-alert-TEASER-shaped message is also caught', async () => {
    db.tables.pending_notifications = [{
      id: 'n2', agent_id: AGENT_ID,
      message: '🔥 A buyer just hit Hot engagement on 4444 Culver Blvd. Subscribe to view contact info and respond: https://x. Reply STOP to opt out.',
      scheduled_for: new Date(Date.now() - 60_000).toISOString(), sent_at: null,
    }]
    await tw.flushDueNotifications(db.client)
    expect(create).not.toHaveBeenCalled()
    expect(db.tables.pending_notifications[0].sent_at).toBeTruthy()
  })

  it('an ordinary queued showing/question alert is unaffected and still sends', async () => {
    db.tables.pending_notifications = [{
      id: 'n3', agent_id: AGENT_ID,
      message: '🏠 New showing request: Test Buyer wants to see 4444 Culver Blvd. View lead: https://x. Reply STOP to opt out.',
      scheduled_for: new Date(Date.now() - 60_000).toISOString(), sent_at: null,
    }]
    const result = await tw.flushDueNotifications(db.client)
    expect(create).toHaveBeenCalledTimes(1)
    expect(result.sent).toBe(1)
  })
})
