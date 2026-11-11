// Email lead alerts via Resend (lib/email.ts) and their wiring into
// app/api/submit-lead. Resend, Twilio and Supabase are all mocked — no real
// emails or texts are sent, and nothing touches a live database.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeFakeDb } from './helpers/fakeSupabase'

vi.mock('server-only', () => ({}))

let db = makeFakeDb()
vi.mock('../lib/supabase-admin', () => ({ createAdminSupabase: () => db.client }))

const create = vi.fn()
vi.mock('twilio', () => ({ default: vi.fn(() => ({ messages: { create } })) }))

const send = vi.fn()
vi.mock('resend', () => ({ Resend: vi.fn(() => ({ emails: { send } })) }))

const email = await import('../lib/email')
const { POST: submitLeadPOST } = await import('../app/api/submit-lead/route')

const AGENT_ID = 'agent-1'
const AGENT_PHONE = '+14155550100'
const AGENT_EMAIL = 'agent@example.com'
const BUYER_PHONE = '(310) 555-0142'

let logs: string[]

beforeEach(() => {
  db = makeFakeDb()
  create.mockReset().mockResolvedValue({ sid: 'SM_OK', status: 'queued' })
  send.mockReset().mockResolvedValue({ data: { id: 're_123' }, error: null })
  process.env.RESEND_API_KEY = 're_test_key'
  process.env.TWILIO_ACCOUNT_SID = 'AC_test'
  process.env.TWILIO_AUTH_TOKEN = 'token'
  process.env.TWILIO_MESSAGING_SERVICE_SID = 'MG_test'
  logs = []
  for (const k of ['log', 'warn', 'error'] as const) {
    vi.spyOn(console, k).mockImplementation((...a: unknown[]) => { logs.push(a.map(String).join(' ')) })
  }
})

// ── sendAgentAlertEmail() — unit ─────────────────────────────────────────────
describe('sendAgentAlertEmail', () => {
  const base = { to: AGENT_EMAIL, plan: 'starter', emailAlertsEnabled: true, subject: 'S', text: 'T', html: '<p>H</p>' }

  it('sends and returns the Resend id', async () => {
    const r = await email.sendAgentAlertEmail(base)
    expect(r).toEqual({ sent: true, id: 're_123' })
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      from: 'theQRealtor <alerts@theqrealtor.com>',
      to: AGENT_EMAIL,
      replyTo: 'hello@theqrealtor.com',
      subject: 'S', text: 'T', html: '<p>H</p>',
    }))
  })

  it('emailAlertsEnabled=false → alerts_off, never calls Resend', async () => {
    const r = await email.sendAgentAlertEmail({ ...base, emailAlertsEnabled: false })
    expect(r).toEqual({ sent: false, reason: 'alerts_off' })
    expect(send).not.toHaveBeenCalled()
  })

  it('no recipient → no_recipient, never calls Resend', async () => {
    expect(await email.sendAgentAlertEmail({ ...base, to: null })).toEqual({ sent: false, reason: 'no_recipient' })
    expect(await email.sendAgentAlertEmail({ ...base, to: undefined })).toEqual({ sent: false, reason: 'no_recipient' })
    expect(send).not.toHaveBeenCalled()
  })

  it('missing RESEND_API_KEY → not_configured, never throws, never calls Resend', async () => {
    delete process.env.RESEND_API_KEY
    const r = await email.sendAgentAlertEmail(base)
    expect(r).toEqual({ sent: false, reason: 'not_configured' })
    expect(send).not.toHaveBeenCalled()
    expect(logs.some(l => l.includes('RESEND_API_KEY not set'))).toBe(true)
  })

  it('Resend returns an error → send_failed, does not throw', async () => {
    send.mockResolvedValueOnce({ data: null, error: { message: 'bad request' } })
    expect(await email.sendAgentAlertEmail(base)).toEqual({ sent: false, reason: 'send_failed' })
  })

  it('Resend throws → send_failed, does not throw (never blocks the caller)', async () => {
    send.mockRejectedValueOnce(new Error('network down'))
    await expect(email.sendAgentAlertEmail(base)).resolves.toEqual({ sent: false, reason: 'send_failed' })
  })

  it('every plan today has canUseEmailAlerts=true, so plan_restricted never fires in practice — proven by exhausting PLAN_CONFIG', async () => {
    const { PLAN_CONFIG } = await import('../lib/plans')
    for (const plan of Object.keys(PLAN_CONFIG)) {
      const r = await email.sendAgentAlertEmail({ ...base, plan })
      expect(r).not.toEqual({ sent: false, reason: 'plan_restricted' })
    }
  })
})

// ── Templates ─────────────────────────────────────────────────────────────────
describe('emailMsg templates', () => {
  it('showingAlert: contact details, address, and a lead link; no score/tier anywhere', () => {
    const { subject, text, html } = email.emailMsg.showingAlert('Bea Buyer', '1 Main St', 'L1', '+13105550142', null, 'Text')
    expect(subject).toContain('1 Main St')
    expect(text).toContain('Bea Buyer wants to see 1 Main St')
    expect(text).toContain('+13105550142')
    expect(text).toContain('(prefers Text)')
    expect(text).toContain('/dashboard/leads/L1')
    expect(text).toContain("You're getting this because email alerts are on")
    expect(html).toContain('/dashboard/leads/L1')
    for (const forbidden of ['score', 'tier', 'intent', 'breakdown', 'Hot', 'Warm', 'Cold']) {
      expect(text.toLowerCase()).not.toContain(forbidden.toLowerCase())
    }
  })

  it('questionAlert: falls back to "no contact info provided" when neither phone nor email given', () => {
    const { text } = email.emailMsg.questionAlert('Bea Buyer', '1 Main St', 'L1', null, null)
    expect(text).toContain('no contact info provided')
  })
})

// ── submit-lead wiring ────────────────────────────────────────────────────────
function seedProperty(overrides: Record<string, unknown> = {}) {
  db.tables.properties = [{ id: 'P1', address: '1 Main St', agent_name: 'Ann Agent', agent_phone: null, active: true, user_id: AGENT_ID }]
  db.tables.profiles = [{
    id: AGENT_ID, name: 'Ann', phone: AGENT_PHONE, notify_showing: true, notify_question: true,
    quiet_hours_enabled: false, quiet_hours_start: '21:00', quiet_hours_end: '08:00', beta_joined_at: null,
    plan: 'founding', sms_alerts_enabled: true, email_alerts_enabled: true,
    ...overrides,
  }]
  db.authUsers[AGENT_ID] = { email: AGENT_EMAIL }
}

let ip = 0
function submit(body: Record<string, unknown>) {
  return submitLeadPOST(new Request('https://theqrealtor.com/api/submit-lead', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.3.0.${++ip}`, 'user-agent': 'Mozilla/5.0' },
    body: JSON.stringify({
      propertyId: 'P1', name: 'Bea Buyer', phone: BUYER_PHONE, motivation: 'hot', smsConsent: false,
      engagement: { ctaClicked: 'showing', visitCount: 1, photosViewed: 0, timeOnPageSec: 5 },
      ...body,
    }),
  }))
}

describe('submit-lead: email alert dispatch', () => {
  it('showing request → email sent to the agent\'s own account email, and the SMS alert still fires too', async () => {
    seedProperty()
    const res = await submit({})
    expect(res.status).toBe(200)
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0][0].to).toBe(AGENT_EMAIL)
    expect(create).toHaveBeenCalledTimes(1)   // agent SMS unaffected by email dispatch
  })

  it('question → email sent, subject/body reflect the question not the showing', async () => {
    seedProperty()
    await submit({ engagement: { ctaClicked: 'question', visitCount: 1, photosViewed: 0, timeOnPageSec: 5 } })
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0][0].subject).toContain('New question')
  })

  it('notify_showing=false → neither the SMS nor the email fires for a showing request', async () => {
    seedProperty({ notify_showing: false })
    await submit({})
    expect(send).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })

  it('Free plan: email still fires (canUseEmailAlerts=true for every plan); SMS is plan_restricted and does not', async () => {
    seedProperty({ plan: 'free', sms_alerts_enabled: false })
    const res = await submit({})
    expect(res.status).toBe(200)
    expect(send).toHaveBeenCalledTimes(1)      // email: Free keeps this
    expect(create).not.toHaveBeenCalled()      // SMS: plan_restricted
  })

  it('email_alerts_enabled=false → no email, but SMS (if entitled) is unaffected', async () => {
    seedProperty({ email_alerts_enabled: false })
    await submit({})
    expect(send).not.toHaveBeenCalled()
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('a Resend failure never fails or delays the lead write', async () => {
    seedProperty()
    send.mockRejectedValueOnce(new Error('resend is down'))
    const res = await submit({})
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(db.tables.leads).toHaveLength(1)
  })

  it('missing RESEND_API_KEY in this environment never fails the lead write', async () => {
    seedProperty()
    delete process.env.RESEND_API_KEY
    const res = await submit({})
    expect(res.status).toBe(200)
    expect(db.tables.leads).toHaveLength(1)
    expect(send).not.toHaveBeenCalled()
  })

  it('auth.admin.getUserById THROWING never skips the buyer confirmation text or the agent SMS', async () => {
    seedProperty()
    db.client.auth.admin.getUserById = vi.fn().mockRejectedValue(new Error('auth is down'))
    const res = await submit({ smsConsent: true })
    expect(res.status).toBe(200)
    expect(send).not.toHaveBeenCalled()                 // no recipient → no email
    expect(db.tables.leads).toHaveLength(1)
    const bodies = create.mock.calls.map(c => c[0].body as string)
    expect(create).toHaveBeenCalledTimes(2)             // agent SMS + buyer confirmation
    expect(bodies.some(b => /theQRealtor|Ann Agent|showing/i.test(b))).toBe(true)
    expect(logs.some(l => l.includes('agent email lookup failed'))).toBe(true)
    // buyer_texted_at stamped = the buyer-confirmation branch ran to completion
    expect(db.tables.leads[0].buyer_texted_at).toBeTruthy()
  })

  it('no account email resolvable (auth.admin.getUserById returns no user) → no_recipient, no throw', async () => {
    seedProperty()
    delete db.authUsers[AGENT_ID]
    const res = await submit({})
    expect(res.status).toBe(200)
    expect(send).not.toHaveBeenCalled()
  })
})
