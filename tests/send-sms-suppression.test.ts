// Opt-out suppression in lib/twilio.ts sendSms()/sendSmsDetailed() and its
// callers. Supabase and the Twilio client are mocked — no real texts are sent
// and nothing touches the live database.

import { beforeEach, describe, expect, it, vi } from 'vitest'

// ── Fake Supabase covering every query shape the code under test uses ────────
type Row = Record<string, any>

function makeFakeDb() {
  const tables: Record<string, Row[]> = {}
  const failReads = new Set<string>()
  const queries: { table: string; op: string; filters: string[] }[] = []
  let seq = 0

  function from(table: string) {
    const st = {
      op: 'select' as 'select' | 'insert' | 'update',
      payload: null as Row | null,
      filters: [] as ((r: Row) => boolean)[],
      filterDesc: [] as string[],
      order: null as { c: string; asc: boolean } | null,
      limit: null as number | null,
      single: null as 'single' | 'maybe' | null,
      head: false,
      returning: false,
    }
    const exec = () => {
      const rows = (tables[table] ??= [])
      queries.push({ table, op: st.op, filters: st.filterDesc })
      const matched = () => rows.filter(r => st.filters.every(f => f(r)))

      if (st.op === 'select') {
        if (failReads.has(table)) return { data: null, count: null, error: { message: `simulated ${table} read failure` } }
        let out = matched()
        if (st.order) {
          const { c, asc } = st.order
          out = [...out].sort((a, b) => (a[c] < b[c] ? -1 : a[c] > b[c] ? 1 : 0) * (asc ? 1 : -1))
        }
        if (st.limit !== null) out = out.slice(0, st.limit)
        if (st.head) return { data: null, count: out.length, error: null }
        if (st.single === 'maybe') return { data: out[0] ?? null, error: null }
        if (st.single === 'single') {
          return out[0] ? { data: out[0], error: null } : { data: null, error: { code: 'PGRST116', message: 'no rows' } }
        }
        return { data: out, error: null }
      }
      if (st.op === 'insert') {
        const row = { id: `row-${++seq}`, created_at: new Date().toISOString(), ...st.payload }
        rows.push(row)
        return { data: st.returning ? (st.single ? row : [row]) : null, error: null }
      }
      const hit = matched()
      hit.forEach(r => Object.assign(r, st.payload))
      return { data: st.returning ? hit : null, error: null }
    }
    const filter = (desc: string, f: (r: Row) => boolean) => { st.filters.push(f); st.filterDesc.push(desc); return b }
    const b: any = {
      select(_cols?: string, opts?: { head?: boolean }) {
        if (st.op === 'select') { if (opts?.head) st.head = true } else st.returning = true
        return b
      },
      insert(p: Row) { st.op = 'insert'; st.payload = p; return b },
      update(p: Row) { st.op = 'update'; st.payload = p; return b },
      eq: (c: string, v: unknown) => filter(`${c}=${v}`, r => r[c] === v),
      is: (c: string, v: unknown) => filter(`${c} is ${v}`, r => (r[c] ?? null) === v),
      not: (c: string, _op: string, v: unknown) => filter(`${c} not ${v}`, r => (r[c] ?? null) !== v),
      lte: (c: string, v: any) => filter(`${c}<=${v}`, r => r[c] <= v),
      gte: (c: string, v: any) => filter(`${c}>=${v}`, r => r[c] >= v),
      order(c: string, o?: { ascending?: boolean }) { st.order = { c, asc: o?.ascending !== false }; return b },
      limit(n: number) { st.limit = n; return b },
      single() { st.single = 'single'; return Promise.resolve(exec()) },
      maybeSingle() { st.single = 'maybe'; return Promise.resolve(exec()) },
      then: (res: any, rej: any) => Promise.resolve(exec()).then(res, rej),
    }
    return b
  }
  return { client: { from } as any, tables, failReads, queries }
}

let db = makeFakeDb()
vi.mock('../lib/supabase-admin', () => ({ createAdminSupabase: () => db.client }))

const create = vi.fn()
vi.mock('twilio', () => ({ default: vi.fn(() => ({ messages: { create } })) }))

const tw = await import('../lib/twilio')
const { POST: testSmsPOST } = await import('../app/api/test-sms/route')
const { POST: submitLeadPOST } = await import('../app/api/submit-lead/route')

// test-sms reads the signed-in user from the server client.
let authedPhone: string | null = '+14155550100'
vi.mock('../lib/supabase-server', () => ({
  createServerSupabase: () => ({
    auth: { getUser: async () => ({ data: { user: authedPhone === null ? null : { id: 'u1', user_metadata: { phone: authedPhone } } } }) },
  }),
}))

// ── Fixtures ──────────────────────────────────────────────────────────────────
const AGENT_ID = 'agent-1'
const AGENT_PHONE = '+14155550100'
const BUYER_RAW = '(310) 555-0142'
const BUYER_E164 = '+13105550142'

const optOut = (phone: string) => { db.tables.sms_contacts = [...(db.tables.sms_contacts ?? []), { phone_e164: phone, status: 'opted_out' }] }
const optIn  = (phone: string) => { db.tables.sms_contacts = [...(db.tables.sms_contacts ?? []), { phone_e164: phone, status: 'opted_in' }] }
const sentTo = () => create.mock.calls.map(c => c[0].to)
const contactLookups = () => db.queries.filter(q => q.table === 'sms_contacts').map(q => q.filters.join(','))

let logs: string[]
beforeEach(() => {
  db = makeFakeDb()
  create.mockReset().mockResolvedValue({ sid: 'SM_OK', status: 'queued' })
  authedPhone = AGENT_PHONE
  process.env.TWILIO_ACCOUNT_SID = 'AC_test'
  process.env.TWILIO_AUTH_TOKEN = 'token'
  process.env.TWILIO_MESSAGING_SERVICE_SID = 'MG_test'
  delete process.env.ADMIN_PHONE_NUMBER
  logs = []
  for (const k of ['log', 'warn', 'error'] as const) {
    vi.spyOn(console, k).mockImplementation((...a: unknown[]) => { logs.push(a.map(String).join(' ')) })
  }
})

// ── sendSms / sendSmsDetailed ─────────────────────────────────────────────────
describe('sendSmsDetailed — suppression gate', () => {
  it('opted_out → not sent', async () => {
    optOut(BUYER_E164)
    expect(await tw.sendSmsDetailed(BUYER_E164, 'hi')).toEqual({ sent: false, suppressed: true, reason: 'opted_out' })
    expect(create).not.toHaveBeenCalled()
    expect(logs.some(l => l.includes('SMS_SUPPRESSED opted_out') && l.includes('***-***-0142'))).toBe(true)
  })

  it('opted_in → sent', async () => {
    optIn(BUYER_E164)
    expect(await tw.sendSmsDetailed(BUYER_E164, 'hi')).toEqual({ sent: true, suppressed: false, sid: 'SM_OK' })
    expect(sentTo()).toEqual([BUYER_E164])
  })

  it('no sms_contacts row → sent', async () => {
    expect((await tw.sendSmsDetailed(BUYER_E164, 'hi')).sent).toBe(true)
  })

  it('lookup error → fails closed (check_failed), not sent', async () => {
    db.failReads.add('sms_contacts')
    expect(await tw.sendSmsDetailed(BUYER_E164, 'hi')).toEqual({ sent: false, suppressed: true, reason: 'check_failed' })
    expect(create).not.toHaveBeenCalled()
    expect(logs.some(l => l.includes('SMS_SUPPRESSION_CHECK_FAILED'))).toBe(true)
  })

  it('unparseable number → invalid_number, not sent, no lookup', async () => {
    expect(await tw.sendSmsDetailed('abc', 'hi')).toEqual({ sent: false, suppressed: true, reason: 'invalid_number' })
    expect(await tw.sendSmsDetailed('555-123-4567', 'hi')).toEqual({ sent: false, suppressed: true, reason: 'invalid_number' })
    expect(create).not.toHaveBeenCalled()
    expect(contactLookups()).toEqual([])
  })

  it('Twilio 21610 → suppressed twilio_blocked; sms_contacts not written', async () => {
    create.mockRejectedValueOnce(Object.assign(new Error('Attempt to send to unsubscribed recipient'), { code: 21610 }))
    expect(await tw.sendSmsDetailed(BUYER_E164, 'hi')).toEqual({ sent: false, suppressed: true, reason: 'twilio_blocked' })
    expect(logs.some(l => l.includes('SMS_BLOCKED_BY_TWILIO_21610') && l.includes('***-***-0142'))).toBe(true)
    expect(db.queries.filter(q => q.table === 'sms_contacts' && q.op !== 'select')).toEqual([])
  })

  it('other Twilio error → send_failed, not suppressed', async () => {
    create.mockRejectedValueOnce(Object.assign(new Error('boom'), { code: 30003 }))
    expect(await tw.sendSmsDetailed(BUYER_E164, 'hi')).toEqual({ sent: false, suppressed: false, reason: 'send_failed', errorCode: 30003 })
  })

  it.each(['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_MESSAGING_SERVICE_SID'])(
    'missing %s → existing fail-safe (skip, no lookup, no send)',
    async envVar => {
      delete process.env[envVar]
      expect(await tw.sendSmsDetailed(BUYER_E164, 'hi')).toEqual({ sent: false, suppressed: false, reason: 'not_configured' })
      expect(await tw.sendSms(BUYER_E164, 'hi')).toBeNull()
      expect(create).not.toHaveBeenCalled()
      expect(contactLookups()).toEqual([])
    },
  )

  it('raw-format number: the lookup and the Twilio send both use the same E.164 form', async () => {
    await tw.sendSmsDetailed(BUYER_RAW, 'hi')
    expect(contactLookups()).toEqual([`phone_e164=${BUYER_E164}`])
    expect(sentTo()).toEqual([BUYER_E164])
  })

  it('raw-format number that is opted out (stored as E.164) is still suppressed', async () => {
    optOut(BUYER_E164)
    expect((await tw.sendSmsDetailed(BUYER_RAW, 'hi')).sent).toBe(false)
    expect(create).not.toHaveBeenCalled()
  })

  it('sendSms() wrapper stays backward compatible: sid on send, null on suppression', async () => {
    expect(await tw.sendSms(BUYER_E164, 'hi')).toBe('SM_OK')
    optOut(BUYER_E164)
    expect(await tw.sendSms(BUYER_E164, 'hi')).toBeNull()
  })
})

// ── Agent alerts ──────────────────────────────────────────────────────────────
const agent = { id: AGENT_ID, quiet_hours_enabled: false, quiet_hours_start: '21:00', quiet_hours_end: '08:00' }
const sendLog = () => (db.tables.sms_send_log ?? []).length

describe('queueOrSendAgentSms', () => {
  it('opted-out agent: not sent, not counted in sms_send_log', async () => {
    optOut(AGENT_PHONE)
    const r = await tw.queueOrSendAgentSms({ admin: db.client, agent, agentPhone: AGENT_PHONE, leadId: 'L1', message: 'alert', alertType: 'showingAlert' })
    expect(r).toBe('suppressed')
    expect(create).not.toHaveBeenCalled()
    expect(sendLog()).toBe(0)
  })

  it('opted-out agent in quiet hours: not queued (so never retried), not counted', async () => {
    optOut(AGENT_PHONE)
    const r = await tw.queueOrSendAgentSms({
      admin: db.client, agent: { ...agent, quiet_hours_enabled: true, quiet_hours_start: '00:00', quiet_hours_end: '23:59' },
      agentPhone: AGENT_PHONE, leadId: 'L1', message: 'alert', alertType: 'showingAlert',
    })
    expect(r).toBe('suppressed')
    expect(db.tables.pending_notifications ?? []).toHaveLength(0)
    expect(sendLog()).toBe(0)
  })

  it('normal agent: sent and counted once', async () => {
    const r = await tw.queueOrSendAgentSms({ admin: db.client, agent, agentPhone: AGENT_PHONE, leadId: 'L1', message: 'alert', alertType: 'showingAlert' })
    expect(r).toBe('sent')
    expect(sendLog()).toBe(1)
  })

  it('Twilio failure: returns failed and is not counted', async () => {
    create.mockRejectedValueOnce(Object.assign(new Error('boom'), { code: 30003 }))
    const r = await tw.queueOrSendAgentSms({ admin: db.client, agent, agentPhone: AGENT_PHONE, leadId: 'L1', message: 'alert', alertType: 'showingAlert' })
    expect(r).toBe('failed')
    expect(sendLog()).toBe(0)
  })
})

describe('flushDueNotifications', () => {
  const due = (id: string) => ({ id, agent_id: AGENT_ID, message: 'queued alert', scheduled_for: new Date(Date.now() - 60_000).toISOString(), sent_at: null })
  beforeEach(() => { db.tables.profiles = [{ id: AGENT_ID, phone: AGENT_PHONE }] })

  it('opted-out agent: marked handled (sent_at stamped), not sent, not retried', async () => {
    optOut(AGENT_PHONE)
    db.tables.pending_notifications = [due('n1')]
    const r = await tw.flushDueNotifications(db.client)
    expect(r).toMatchObject({ processed: 1, sent: 0, failed: 0, suppressed: 1 })
    expect(create).not.toHaveBeenCalled()
    expect(db.tables.pending_notifications[0].sent_at).toBeTruthy()
    const again = await tw.flushDueNotifications(db.client)   // nothing left to retry
    expect(again.processed).toBe(0)
  })

  it('consent-check failure: left queued for retry (transient)', async () => {
    db.failReads.add('sms_contacts')
    db.tables.pending_notifications = [due('n2')]
    const r = await tw.flushDueNotifications(db.client)
    expect(r).toMatchObject({ sent: 0, failed: 1, suppressed: 0 })
    expect(db.tables.pending_notifications[0].sent_at).toBeNull()
  })

  it('normal agent: sent and stamped', async () => {
    db.tables.pending_notifications = [due('n3')]
    expect(await tw.flushDueNotifications(db.client)).toMatchObject({ sent: 1, suppressed: 0 })
  })
})

// ── Founder alarm ─────────────────────────────────────────────────────────────
describe('founder alarm counts only real sends', () => {
  it('99 real sends + suppressed attempts never reach the 100 alarm', async () => {
    process.env.ADMIN_PHONE_NUMBER = '+14155550199'
    db.tables.sms_send_log = Array.from({ length: 99 }, (_, i) => ({ id: `s${i}`, agent_id: AGENT_ID, alert_type: 'x', created_at: new Date().toISOString() }))
    optOut(AGENT_PHONE)
    for (let i = 0; i < 5; i++) {
      await tw.queueOrSendAgentSms({ admin: db.client, agent, agentPhone: AGENT_PHONE, leadId: 'L', message: 'm', alertType: 'x' })
    }
    expect(sendLog()).toBe(99)
    expect(create).not.toHaveBeenCalled()   // neither the alerts nor the founder alarm
  })
})

// ── test-sms route ────────────────────────────────────────────────────────────
describe('app/api/test-sms', () => {
  const PAUSED = 'Texts to this number are paused because it replied STOP. Text START to (620) 522-8398 to turn them back on.'

  it('opted out → exact paused message', async () => {
    optOut(AGENT_PHONE)
    const res = await testSmsPOST()
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: PAUSED })
  })

  it('blocked by Twilio (21610) → same paused message', async () => {
    create.mockRejectedValueOnce(Object.assign(new Error('unsubscribed'), { code: 21610 }))
    const res = await testSmsPOST()
    expect(await res.json()).toEqual({ error: PAUSED })
  })

  it('check failed → try-again message', async () => {
    db.failReads.add('sms_contacts')
    const res = await testSmsPOST()
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: "Couldn't send right now — please try again in a minute." })
  })

  it('normal → ok', async () => {
    const res = await testSmsPOST()
    expect(await res.json()).toEqual({ ok: true })
  })
})

// ── submit-lead buyer confirmation ────────────────────────────────────────────
describe('submit-lead: opted-out buyer', () => {
  it('lead is created and the response is unchanged; buyer is not texted and buyer_texted_at stays unset', async () => {
    optOut(BUYER_E164)
    db.tables.properties = [{ id: 'P1', address: '1 Main St', agent_name: 'Ann Agent', agent_phone: null, active: true, user_id: AGENT_ID }]
    db.tables.profiles = [{
      id: AGENT_ID, name: 'Ann', phone: AGENT_PHONE, notify_showing: true, notify_question: true, notify_hot_lead: true,
      quiet_hours_enabled: false, quiet_hours_start: '21:00', quiet_hours_end: '08:00', beta_joined_at: null, plan: 'founding',
    }]
    const res = await submitLeadPOST(new Request('https://theqrealtor.com/api/submit-lead', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '10.0.0.9', 'user-agent': 'Mozilla/5.0' },
      body: JSON.stringify({
        propertyId: 'P1', name: 'Bea Buyer', phone: BUYER_RAW, motivation: 'hot',
        smsConsent: true, engagement: { ctaClicked: 'showing', visitCount: 1, photosViewed: 0, timeOnPageSec: 5 },
      }),
    }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(db.tables.leads).toHaveLength(1)
    expect(db.tables.leads[0].buyer_texted_at).toBeUndefined()
    expect(sentTo()).not.toContain(BUYER_E164)   // buyer suppressed
    expect(sentTo()).toContain(AGENT_PHONE)      // agent alert still went out
  })
})

describe('logging', () => {
  it('never logs a full phone number', async () => {
    optOut(BUYER_E164)
    await tw.sendSmsDetailed(BUYER_E164, 'hi')
    await tw.sendSmsDetailed(AGENT_PHONE, 'hi')
    create.mockRejectedValueOnce(Object.assign(new Error('x'), { code: 21610 }))
    await tw.sendSmsDetailed('+12125550123', 'hi')
    const all = logs.join('\n')
    expect(all).toContain('***-***-')
    for (const n of [BUYER_E164, AGENT_PHONE, '+12125550123']) expect(all).not.toContain(n.slice(2))
  })
})
