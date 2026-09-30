// Route-level tests for app/api/sms/inbound — the Supabase client, Twilio
// signature validation and lib/twilio's sendSms are all mocked. Nothing here
// touches the live database (sms_consent_events is append-only, so real test
// rows could never be removed).

import { beforeEach, describe, expect, it, vi } from 'vitest'

// ── In-memory fake of the slice of supabase-js the route uses ────────────────
type Row = Record<string, any>
type Tables = Record<string, Row[]>

const db: { tables: Tables; failWrites: Set<string>; failReads: Set<string>; writes: { table: string; op: string; row: Row }[] } = {
  tables: {},
  failWrites: new Set(),
  failReads: new Set(),
  writes: [],
}

const UNIQUE: Record<string, string> = { sms_consent_events: 'twilio_message_sid' }
const PK: Record<string, string> = { sms_contacts: 'phone_e164', sms_autoreply_state: 'phone_e164' }

function query(table: string) {
  const filters: [string, unknown][] = []
  let orderBy: { col: string; asc: boolean } | null = null
  let limitN: number | null = null
  let single = false

  const run = () => {
    if (db.failReads.has(table)) return { data: null, error: { message: `simulated ${table} read failure` } }
    let rows = (db.tables[table] ?? []).filter(r => filters.every(([c, v]) => r[c] === v))
    if (orderBy) {
      const { col, asc } = orderBy
      rows = [...rows].sort((a, b) => (a[col] < b[col] ? -1 : a[col] > b[col] ? 1 : 0) * (asc ? 1 : -1))
    }
    if (limitN !== null) rows = rows.slice(0, limitN)
    if (single) return { data: rows[0] ?? null, error: null }
    return { data: rows, error: null }
  }

  const builder: any = {
    select: () => builder,
    eq: (c: string, v: unknown) => { filters.push([c, v]); return builder },
    order: (col: string, o?: { ascending?: boolean }) => { orderBy = { col, asc: o?.ascending !== false }; return builder },
    limit: (n: number) => { limitN = n; return builder },
    maybeSingle: () => { single = true; return Promise.resolve(run()) },
    then: (res: any, rej: any) => Promise.resolve(run()).then(res, rej),
  }
  return builder
}

const fakeAdmin = {
  from(table: string) {
    return {
      ...query(table),
      insert(row: Row) {
        db.writes.push({ table, op: 'insert', row })
        if (db.failWrites.has(table)) return Promise.resolve({ error: { message: `simulated ${table} write failure` } })
        const key = UNIQUE[table]
        const rows = (db.tables[table] ??= [])
        if (key && rows.some(r => r[key] === row[key])) {
          return Promise.resolve({ error: { code: '23505', message: 'duplicate key value violates unique constraint' } })
        }
        rows.push({ ...row })
        return Promise.resolve({ error: null })
      },
      upsert(row: Row) {
        db.writes.push({ table, op: 'upsert', row })
        if (db.failWrites.has(table)) return Promise.resolve({ error: { message: `simulated ${table} write failure` } })
        const key = PK[table]
        const rows = (db.tables[table] ??= [])
        const existing = rows.find(r => r[key] === row[key])
        if (existing) Object.assign(existing, row)
        else rows.push({ ...row })
        return Promise.resolve({ error: null })
      },
    }
  },
}

vi.mock('../lib/supabase-admin', () => ({ createAdminSupabase: () => fakeAdmin }))

const validateRequest = vi.fn(() => true)
vi.mock('twilio', () => ({ validateRequest: (...a: unknown[]) => validateRequest(...(a as [])) }))

const sendSms = vi.fn()
vi.mock('../lib/twilio', () => ({ sendSms: (...a: unknown[]) => sendSms(...a) }))

const { POST } = await import('../app/api/sms/inbound/route')

// ── Helpers ───────────────────────────────────────────────────────────────────
const OUR = '+16205228398'
const BUYER = '+14155550142'
const AGENT = '+13105559876'
const AGENT_ID = '11111111-1111-1111-1111-111111111111'
const LEAD_ID = '22222222-2222-2222-2222-222222222222'

let sidCounter = 0
function inbound(body: string, extra: Record<string, string> = {}, from = BUYER) {
  const params = new URLSearchParams({ From: from, To: OUR, Body: body, MessageSid: `SM${++sidCounter}`, ...extra })
  return POST(new Request('https://theqrealtor.com/api/sms/inbound', {
    method: 'POST',
    headers: { 'x-twilio-signature': 'sig', host: 'theqrealtor.com', 'x-forwarded-proto': 'https' },
    body: params,
  }))
}

async function reply(res: Response) {
  expect(res.headers.get('content-type')).toBe('text/xml')
  const xml = await res.text()
  expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?><Response>')).toBe(true)
  expect(xml.endsWith('</Response>')).toBe(true)
  const m = xml.match(/<Message>([\s\S]*)<\/Message>/)
  return m ? m[1] : null
}

const unescape = (s: string) => s.replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')

const FREEFORM_REPLY = "theQRealtor: You're unsubscribed and won't get more texts from this number. Reply START to resubscribe."
const AGENT_REPLY = "theQRealtor: This number sends alerts only and replies aren't read. Manage your alert settings in your theQRealtor dashboard."
const OTHER_REPLY = "theQRealtor: This number sends alerts only and can't receive replies. If you submitted a request, the listing agent will contact you directly."

const events = () => db.tables.sms_consent_events ?? []
const contact = (p = BUYER) => (db.tables.sms_contacts ?? []).find(r => r.phone_e164 === p)

let logs: string[]
beforeEach(() => {
  db.tables = {
    profiles: [{ id: AGENT_ID, phone: AGENT }],
    leads: [{ id: LEAD_ID, agent_id: AGENT_ID, phone_e164: BUYER, created_at: '2026-09-01T00:00:00Z', properties: { user_id: AGENT_ID } }],
  }
  db.failWrites = new Set()
  db.failReads = new Set()
  db.writes = []
  validateRequest.mockReset().mockReturnValue(true)
  sendSms.mockReset()
  process.env.TWILIO_AUTH_TOKEN = 'test-token'
  logs = []
  for (const k of ['log', 'warn', 'error'] as const) {
    vi.spyOn(console, k).mockImplementation((...a: unknown[]) => { logs.push(a.map(String).join(' ')) })
  }
})

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('signature gate (unchanged)', () => {
  it('403s on an invalid signature and touches nothing', async () => {
    validateRequest.mockReturnValue(false)
    const res = await inbound('STOP')
    expect(res.status).toBe(403)
    expect(db.writes).toEqual([])
  })
})

describe('opt-out', () => {
  it('STOP keyword: records event + opted_out, empty TwiML (Twilio replies)', async () => {
    const res = await inbound('STOP')
    expect(res.status).toBe(200)
    expect(await reply(res)).toBeNull()
    expect(events()).toHaveLength(1)
    expect(events()[0]).toMatchObject({
      phone_e164: BUYER, event_type: 'opt_out', detection_source: 'keyword_match', matched_keyword: 'stop',
      message_body: 'STOP', our_number: OUR, lead_id: LEAD_ID, agent_id: AGENT_ID,
    })
    expect(contact()).toMatchObject({ status: 'opted_out', last_event_type: 'opt_out', last_keyword: 'stop', last_our_number: OUR })
    expect(contact()!.opted_out_at).toBeTruthy()
  })

  it('"Stop." variant is a keyword match', async () => {
    const res = await inbound('Stop.')
    expect(await reply(res)).toBeNull()
    expect(events()[0]).toMatchObject({ event_type: 'opt_out', detection_source: 'keyword_match', matched_keyword: 'stop' })
  })

  it('OptOutType=STOP is taken from Twilio', async () => {
    const res = await inbound('stop please', { OptOutType: 'STOP' })
    expect(await reply(res)).toBeNull()
    expect(events()[0]).toMatchObject({ event_type: 'opt_out', detection_source: 'twilio_opt_out_type' })
    expect(contact()!.status).toBe('opted_out')
  })

  it('freeform "please stop texting me": opt-out + our own TwiML confirmation', async () => {
    const res = await inbound('please stop texting me')
    expect(unescape((await reply(res))!)).toBe(FREEFORM_REPLY)
    expect(events()[0]).toMatchObject({ event_type: 'opt_out', detection_source: 'freeform_match', matched_keyword: 'stop text' })
    expect(contact()!.status).toBe('opted_out')
  })

  it('duplicate MessageSid: second delivery writes nothing', async () => {
    const params = { MessageSid: 'SMdup' }
    await inbound('STOP', params)
    const writesAfterFirst = db.writes.length
    const res = await inbound('STOP', params)
    expect(res.status).toBe(200)
    expect(await reply(res)).toBeNull()
    expect(events()).toHaveLength(1)
    expect(db.writes.length).toBe(writesAfterFirst)
  })

  it('message body is truncated to 500 chars in the audit row', async () => {
    await inbound('please stop texting me ' + 'x'.repeat(600))
    expect(events()[0].message_body.length).toBe(500)
  })
})

describe('opt-in and help', () => {
  it('START: records event + opted_in, keeps opted_out_at history, empty TwiML', async () => {
    await inbound('STOP')
    const optedOutAt = contact()!.opted_out_at
    const res = await inbound('START')
    expect(await reply(res)).toBeNull()
    expect(events().map(e => e.event_type)).toEqual(['opt_out', 'opt_in'])
    expect(contact()).toMatchObject({ status: 'opted_in', last_event_type: 'opt_in', last_keyword: 'start', opted_out_at: optedOutAt })
    expect(contact()!.opted_in_at).toBeTruthy()
  })

  it('HELP: records event, does not touch sms_contacts, empty TwiML', async () => {
    const res = await inbound('HELP')
    expect(await reply(res)).toBeNull()
    expect(events()[0]).toMatchObject({ event_type: 'help', detection_source: 'keyword_match', matched_keyword: 'help' })
    expect(contact()).toBeUndefined()
  })
})

describe('ordinary messages', () => {
  it('unknown number gets the generic auto-reply, body not stored', async () => {
    const stranger = '+12125550199'
    const res = await inbound('Is the house still available? call me 555', {}, stranger)
    expect(unescape((await reply(res))!)).toBe(OTHER_REPLY)
    expect(events()).toHaveLength(0)
    expect(db.tables.sms_autoreply_state).toHaveLength(1)
    expect(JSON.stringify(db.writes)).not.toContain('still available')
  })

  it('a second ordinary message within 24h gets no reply', async () => {
    await inbound('hello')
    const res = await inbound('hello again')
    expect(await reply(res)).toBeNull()
  })

  it('replies again once the 24h window has passed', async () => {
    db.tables.sms_autoreply_state = [{ phone_e164: BUYER, last_autoreply_at: new Date(Date.now() - 25 * 3600_000).toISOString() }]
    const res = await inbound('hello')
    expect(unescape((await reply(res))!)).toBe(OTHER_REPLY)
  })

  it('opted-out number gets no reply', async () => {
    await inbound('STOP')
    const res = await inbound('hello?')
    expect(await reply(res)).toBeNull()
    expect(db.tables.sms_autoreply_state ?? []).toHaveLength(0)
  })

  it("agent's own number gets the agent variant", async () => {
    const res = await inbound('Got it thanks', {}, AGENT)
    expect(unescape((await reply(res))!)).toBe(AGENT_REPLY)
  })

  it('"yes" is an ordinary message, not an opt-in', async () => {
    await inbound('STOP')
    db.tables.sms_autoreply_state = []
    const res = await inbound('yes')
    expect(await reply(res)).toBeNull()             // still opted out → silent
    expect(contact()!.status).toBe('opted_out')      // and NOT flipped to opted_in
    expect(events()).toHaveLength(1)
  })
})

describe('sender linkage', () => {
  it('leads spanning two agents link to neither', async () => {
    db.tables.leads.push({ id: '33333333-3333-3333-3333-333333333333', agent_id: '44444444-4444-4444-4444-444444444444', phone_e164: BUYER, created_at: '2026-09-02T00:00:00Z', properties: null })
    await inbound('STOP')
    expect(events()[0]).toMatchObject({ lead_id: null, agent_id: null })
  })

  it("an agent's opt-out links agent_id, no lead", async () => {
    await inbound('STOP', {}, AGENT)
    expect(events()[0]).toMatchObject({ agent_id: AGENT_ID, lead_id: null })
  })

  it('a lead with no agent_id resolves through the property owner', async () => {
    db.tables.leads[0].agent_id = null
    await inbound('STOP')
    expect(events()[0]).toMatchObject({ agent_id: AGENT_ID, lead_id: LEAD_ID })
  })

  it('…also when the embedded property arrives as an array', async () => {
    db.tables.leads[0].agent_id = null
    db.tables.leads[0].properties = [{ user_id: AGENT_ID }]
    await inbound('STOP')
    expect(events()[0]).toMatchObject({ agent_id: AGENT_ID, lead_id: LEAD_ID })
  })
})

describe('failure handling', () => {
  it('opt-out: sms_contacts write failure → 500 SMS_CONSENT_WRITE_FAILED, no reply', async () => {
    db.failWrites.add('sms_contacts')
    const res = await inbound('STOP')
    expect(res.status).toBe(500)
    expect(logs.some(l => l.includes('SMS_CONSENT_WRITE_FAILED'))).toBe(true)
  })

  it('opt-out: audit insert failure → 500, but the number is already suppressed', async () => {
    db.failWrites.add('sms_consent_events')
    const res = await inbound('STOP')
    expect(res.status).toBe(500)
    expect(contact()!.status).toBe('opted_out')
  })

  it('ordinary: throttle read failure fails safe (no reply, 200)', async () => {
    db.failReads.add('sms_autoreply_state')
    const res = await inbound('hello')
    expect(res.status).toBe(200)
    expect(await reply(res)).toBeNull()
  })

  it('ordinary: throttle write failure fails safe (no reply, 200)', async () => {
    db.failWrites.add('sms_autoreply_state')
    const res = await inbound('hello')
    expect(res.status).toBe(200)
    expect(await reply(res)).toBeNull()
  })
})

describe('invariants across every case above', () => {
  it('sendSms is never called and no body or full number is logged', async () => {
    const cases: [string, Record<string, string>, string][] = [
      ['STOP', {}, BUYER], ['Stop.', {}, BUYER], ['x', { OptOutType: 'STOP' }, BUYER], ['START', {}, BUYER],
      ['HELP', {}, BUYER], ['please stop texting me', {}, BUYER], ['secret body text 1234', {}, '+12125550199'],
      ['another secret body', {}, AGENT], ['yes', {}, BUYER],
    ]
    for (const [body, extra, from] of cases) await inbound(body, extra, from)
    expect(sendSms).not.toHaveBeenCalled()
    const all = logs.join('\n')
    expect(all).toContain('event=opt_out source=keyword_match from=***-***-0142')   // capture is live
    expect(all).toContain('autoreply=true')
    expect(all).not.toContain('secret body')
    expect(all).not.toContain('please stop texting')
    for (const n of [BUYER, AGENT, '+12125550199', OUR]) expect(all).not.toContain(n.slice(2))
  })

  it('TwiML escapes XML special characters (reply text contains apostrophes)', async () => {
    const res = await inbound('hello', {}, '+12125550188')
    const raw = await res.text()
    expect(raw).toContain('&apos;')
    expect(raw).not.toMatch(/<Message>[^<]*'[^<]*<\/Message>/)
  })
})
