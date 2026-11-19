// Batch 4: durable SMS caps (lib/smsLimits.ts, table sms_rate_events).
// Supabase and Twilio are faked — no SMS is sent, no live data touched.

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { createHash } from 'crypto'
import { makeFakeDb } from './helpers/fakeSupabase'

vi.mock('server-only', () => ({}))

let db = makeFakeDb()
vi.mock('../lib/supabase-admin', () => ({ createAdminSupabase: () => db.client }))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => db.client }))

const create = vi.fn()
vi.mock('twilio', () => ({ default: vi.fn(() => ({ messages: { create } })) }))
const verifyStarted: string[] = []
vi.mock('../lib/twilio', async () => {
  const real = await vi.importActual<typeof import('../lib/twilio')>('../lib/twilio')
  return { ...real, startPhoneVerification: async (p: string) => { verifyStarted.push(p); return { ok: true } } }
})

const L = await import('../lib/smsLimits')
const { POST: submitLead } = await import('../app/api/submit-lead/route')
const { POST: sendCode } = await import('../app/api/auth/phone/send/route')

const read = (p: string) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const sha = (v: string) => createHash('sha256').update(v).digest('hex')
const AGENT = 'agent-1'
const PHONE = '+13105550142'
const P1 = '11111111-1111-1111-1111-111111111111'
const P2 = '22222222-2222-2222-2222-222222222222'

function seed() {
  db.tables.properties = [P1, P2].map(id => ({ id, address: '1 Main St', agent_name: 'Jane Smith', agent_phone: null, active: true, user_id: AGENT }))
  db.tables.profiles = [{
    id: AGENT, name: 'Jane', phone: '+14155550100', notify_showing: true, notify_question: true,
    quiet_hours_enabled: false, quiet_hours_start: '21:00', quiet_hours_end: '08:00', beta_joined_at: null, plan: 'founding',
  }]
  db.tables.beta_allowlist = [{ email: 'a@example.com', approved: true }]
}

let n = 0
const ipOf = () => `203.0.113.${++n}`
const phoneOf = (i: number) => `+1310555${String(1000 + i)}`   // distinct valid-looking numbers

async function lead(o: { ip?: string; phone?: string; property?: string; routePost?: typeof submitLead } = {}) {
  const post = o.routePost ?? submitLead
  return post(new Request('https://x/api/submit-lead', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-vercel-forwarded-for': o.ip ?? ipOf(), 'user-agent': 'Mozilla/5.0' },
    body: JSON.stringify({
      propertyId: o.property ?? P1, name: 'Buyer', phone: o.phone ?? PHONE, motivation: 'hot', smsConsent: true,
      engagement: { ctaClicked: 'showing', visitCount: 1, photosViewed: 0, timeOnPageSec: 5 },
    }),
  }))
}
const code = (o: { ip?: string; phone?: string; post?: typeof sendCode } = {}) =>
  (o.post ?? sendCode)(new Request('https://x/api/auth/phone/send', {
    method: 'POST',
    headers: { 'x-vercel-forwarded-for': o.ip ?? ipOf() },
    body: JSON.stringify({ phone: o.phone ?? '(415) 555-2671', email: 'a@example.com' }),
  }))

const buyerTexts = () => create.mock.calls.filter(c => c[0].to !== '+14155550100')
const events = (kind: string) => (db.tables.sms_rate_events ?? []).filter(r => r.kind === kind)
const fill = (rows: Record<string, unknown>[], ago = 60_000) => {
  (db.tables.sms_rate_events ??= []).push(...rows.map(r => ({ allowed: true, created_at: new Date(Date.now() - ago).toISOString(), ...r })))
}

beforeEach(() => {
  db = makeFakeDb(); seed(); verifyStarted.length = 0
  create.mockReset().mockImplementation(async () => ({ sid: 'SM', status: 'accepted', from: null }))
  process.env.TWILIO_ACCOUNT_SID = 'AC_test'; process.env.TWILIO_AUTH_TOKEN = 'token'; process.env.TWILIO_MESSAGING_SERVICE_SID = 'MG_test'
  for (const k of ['log', 'warn', 'error'] as const) vi.spyOn(console, k).mockImplementation(() => {})
})

// ── Scenarios, parameterised by implementation so the mutation checks can reuse them ──
type Lib = typeof L
const seedConf = (phone: string, listing: string, k = 1) =>
  fill(Array.from({ length: k }, () => ({ kind: 'buyer_confirmation', phone_hash: sha(phone), listing_id: listing })))

async function phoneConfirmCapAllows(lib: Lib, over: number) {      // true if `over` confirmations to one number are all allowed
  let ok = true
  for (let i = 0; i < over; i++) ok = (await lib.reserveBuyerConfirmation(db.client, { phoneE164: PHONE, listingId: P1 })).ok && ok
  return ok
}
async function verifyCapAllows(lib: Lib, over: number) {
  let ok = true
  for (let i = 0; i < over; i++) ok = (await lib.reserveVerificationCode(db.client, { phoneE164: PHONE })).ok && ok
  return ok
}
async function listingCapAllows(lib: Lib) {
  fill(Array.from({ length: 50 }, (_, i) => ({ kind: 'buyer_confirmation', phone_hash: sha(phoneOf(i)), listing_id: P1 })))
  return (await lib.reserveBuyerConfirmation(db.client, { phoneE164: '+14155550999', listingId: P1 })).ok
}
async function ipCapAllows(lib: Lib, route: 'lead_request' | 'send_code_request') {
  let ok = true
  for (let i = 0; i < 11; i++) ok = (await lib.reserveIpRequest(db.client, route, '198.51.100.7')).ok && ok
  return ok
}

// ── 1. Per destination phone ─────────────────────────────────────────────────
describe('per-phone caps', () => {
  it('3 confirmation texts per number per 24h; the 4th is refused', async () => {
    expect(await phoneConfirmCapAllows(L, 3)).toBe(true)
    expect((await L.reserveBuyerConfirmation(db.client, { phoneE164: PHONE, listingId: P1 }))).toEqual({ ok: false, reason: 'phone_cap' })
  })
  it('5 verification codes per number per 24h; the 6th is refused', async () => {
    expect(await verifyCapAllows(L, 5)).toBe(true)
    expect((await L.reserveVerificationCode(db.client, { phoneE164: PHONE }))).toEqual({ ok: false, reason: 'phone_cap' })
  })
  it('the cap is a 24h window — older rows do not count, and refused attempts do not count', async () => {
    seedConf(PHONE, P1, 3)
    expect((await L.reserveBuyerConfirmation(db.client, { phoneE164: PHONE, listingId: P1 })).ok).toBe(false)
    db.tables.sms_rate_events = db.tables.sms_rate_events.map(r => ({ ...r, created_at: new Date(Date.now() - 25 * 3_600_000).toISOString() }))
    expect((await L.reserveBuyerConfirmation(db.client, { phoneE164: PHONE, listingId: P1 })).ok).toBe(true)
    // refused attempts are kept but flagged, so an attacker can't extend someone's lockout
    for (let i = 0; i < 10; i++) await L.reserveBuyerConfirmation(db.client, { phoneE164: PHONE, listingId: P1 })
    expect(events('buyer_confirmation').filter(r => r.allowed && Date.now() - Date.parse(r.created_at) < 3_600_000).length).toBe(3)
  })
  it('lead route: same number across different listings and different IPs shares one cap of 3', async () => {
    for (const prop of [P1, P2, P1, P2, P1]) expect((await lead({ property: prop })).status).toBe(200)
    expect(buyerTexts()).toHaveLength(3)
    expect(db.tables.leads).toHaveLength(5)               // every lead still saved
    expect(db.tables.leads.filter(l => l.buyer_texted_at)).toHaveLength(3)
  })
  it('send-code route: 5 codes per number across different IPs, then a friendly refusal', async () => {
    for (let i = 0; i < 5; i++) expect((await code()).status).toBe(200)
    const res = await code()
    expect(res.status).toBe(429)
    expect((await res.json()).error).toBe('Too many attempts, try again later.')
    expect(verifyStarted).toHaveLength(5)
  })
  it('the two phone caps are independent kinds (codes do not use up confirmations, and vice versa)', async () => {
    expect(await verifyCapAllows(L, 5)).toBe(true)
    expect(await phoneConfirmCapAllows(L, 3)).toBe(true)
  })
})

// ── 2. Per listing ───────────────────────────────────────────────────────────
describe('per-listing cap', () => {
  it('50 confirmation texts per listing per 24h; the 51st is refused, other listings unaffected', async () => {
    expect(await listingCapAllows(L)).toBe(false)
    expect((await L.reserveBuyerConfirmation(db.client, { phoneE164: '+14155550998', listingId: P2 })).ok).toBe(true)
  })
  it('lead route: at the listing cap the lead is saved and the buyer is not texted', async () => {
    fill(Array.from({ length: 50 }, (_, i) => ({ kind: 'buyer_confirmation', phone_hash: sha(phoneOf(i)), listing_id: P1 })))
    expect((await lead()).status).toBe(200)
    expect(db.tables.leads).toHaveLength(1)
    expect(buyerTexts()).toHaveLength(0)
  })
  it('the existing 100/day agent alarm table is not fed by the new caps', async () => {
    await lead()
    expect((db.tables.sms_send_log ?? []).filter(r => r.alert_type === 'buyer_confirmation')).toHaveLength(0)
    expect(events('buyer_confirmation')).toHaveLength(1)
  })
})

// ── 3. Per IP ────────────────────────────────────────────────────────────────
describe('per-IP cap (10/hour)', () => {
  it('lib: 10 allowed, the 11th refused, per route', async () => {
    expect(await ipCapAllows(L, 'lead_request')).toBe(false)
    expect(await ipCapAllows(L, 'send_code_request')).toBe(false)
  })
  it('lead route: 11th request from one IP is saved but not texted', async () => {
    const ip = '198.51.100.9'
    for (let i = 0; i < 11; i++) expect((await lead({ ip, phone: phoneOf(i) })).status).toBe(200)
    expect(db.tables.leads).toHaveLength(11)
    expect(buyerTexts()).toHaveLength(10)
  })
  it('send-code route: 11th request from one IP gets the friendly refusal and no code', async () => {
    const ip = '198.51.100.10'
    for (let i = 0; i < 10; i++) expect((await code({ ip, phone: phoneOf(i) })).status).toBe(200)
    const res = await code({ ip, phone: phoneOf(99) })
    expect(res.status).toBe(429)
    expect((await res.json()).error).toBe('Too many attempts, try again later.')
    expect(verifyStarted).toHaveLength(10)
  })
  it("uses Vercel's trusted header; a client-supplied x-forwarded-for cannot dodge the cap", async () => {
    const mk = (h: Record<string, string>) => new Request('https://x', { headers: h })
    expect(L.clientIp(mk({ 'x-vercel-forwarded-for': '203.0.113.5, 10.0.0.1', 'x-forwarded-for': '6.6.6.6' }))).toBe('203.0.113.5')
    expect(L.clientIp(mk({ 'x-forwarded-for': '6.6.6.6' }))).toBe('unknown')
    const ip = '198.51.100.11'
    for (let i = 0; i < 11; i++) {
      await submitLead(new Request('https://x', {
        method: 'POST',
        headers: { 'x-vercel-forwarded-for': ip, 'x-forwarded-for': `9.9.9.${i}`, 'user-agent': 'Mozilla/5.0' },
        body: JSON.stringify({ propertyId: P1, name: 'B', phone: phoneOf(i), motivation: 'hot', smsConsent: true, engagement: { ctaClicked: 'showing' } }),
      }))
    }
    expect(buyerTexts()).toHaveLength(10)
  })
  it('stores hashes, never the raw phone or IP', async () => {
    await lead({ ip: '198.51.100.12' })
    const dump = JSON.stringify(db.tables.sms_rate_events)
    expect(dump).not.toContain('198.51.100.12'); expect(dump).not.toContain('5550142')
  })
})

// ── 4 & 5. Skipping, not crashing; fail closed ───────────────────────────────
describe('when a cap is hit or the count cannot be read', () => {
  it('cap hit: lead saved, response 200, buyer not texted, reason logged, refused attempt kept as audit row', async () => {
    seedConf(PHONE, P1, 3)
    const res = await lead()
    expect(res.status).toBe(200)
    expect(db.tables.leads).toHaveLength(1)
    expect(buyerTexts()).toHaveLength(0)
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('skipped'), 'phone_cap', expect.anything(), expect.anything())
    expect(events('buyer_confirmation').some(r => r.allowed === false)).toBe(true)
  })
  it('lead route fails closed when the count cannot be read: lead saved, no buyer text, no crash', async () => {
    db.failReads.add('sms_rate_events')
    const res = await lead()
    expect(res.status).toBe(200)
    expect(db.tables.leads).toHaveLength(1)
    expect(buyerTexts()).toHaveLength(0)
  })
  it('lead route fails closed when the log write fails', async () => {
    db.failWrites.set('sms_rate_events', { message: 'boom' })
    expect((await lead()).status).toBe(200)
    expect(db.tables.leads).toHaveLength(1)
    expect(buyerTexts()).toHaveLength(0)
  })
  it('lead route: an unparseable number is never texted (cannot be capped), lead still saved', async () => {
    expect((await lead({ phone: '123' })).status).toBe(200)
    expect(db.tables.leads).toHaveLength(1)
    expect(buyerTexts()).toHaveLength(0)
  })
  it('send-code fails closed when the count cannot be read: friendly 503, no code sent', async () => {
    db.failReads.add('sms_rate_events')
    const res = await code()
    expect(res.status).toBe(503)
    expect((await res.json()).error).toMatch(/try again/i)
    expect(verifyStarted).toHaveLength(0)
  })
  it('lib never throws, even if the client itself throws', async () => {
    const boom = { from: () => { throw new Error('down') } }
    expect(await L.reserveBuyerConfirmation(boom, { phoneE164: PHONE, listingId: P1 })).toEqual({ ok: false, reason: 'check_failed' })
    expect(await L.reserveIpRequest(boom, 'lead_request', '1.2.3.4')).toEqual({ ok: false, reason: 'check_failed' })
  })
  it('the old in-memory limiters are gone', () => {
    for (const f of ['app/api/submit-lead/route.ts', 'app/api/auth/phone/send/route.ts']) {
      const s = read(f)
      expect(s).not.toMatch(/rateMap|isRateLimited/)
      expect(s).not.toMatch(/x-forwarded-for/)
    }
  })
})

// ── Mutation checks ──────────────────────────────────────────────────────────
// Each mutant is a real copy of the code with ONE protection removed/loosened.
// The scenario that the real code passes must then go the other way — proving
// the tests above would catch the regression.
describe('mutation checks', () => {
  const libSrc = read('lib/smsLimits.ts')
  // Mutants live under tests/ (not lib/ or app/) so the repo-scanning tests in
  // other files never see them; relative imports are rewritten to absolute.
  const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
  const MUT = new URL('./__mutants__/', import.meta.url)
  mkdirSync(MUT, { recursive: true })
  const absolutize = (src: string) => src.replace(/from '((?:\.\.\/)+)([^']+)'/g, `from '${ROOT}/$2'`)
  const writeMutant = (name: string, src: string) => { writeFileSync(new URL(name + '.ts', MUT), absolutize(src)); return new URL(name + '.ts', MUT).pathname }
  const mutantLib = async (name: string, from: string | RegExp, to: string): Promise<Lib> => {
    expect(typeof from === 'string' ? libSrc.includes(from) : from.test(libSrc)).toBe(true)   // the mutation must actually apply
    const mutated = libSrc.replace(from, to)
    expect(mutated).not.toBe(libSrc)
    return import(/* @vite-ignore */ writeMutant('lib_' + name, mutated))
  }
  afterAll(() => rmSync(MUT, { recursive: true, force: true }))

  it('phone confirmation cap 3 → 4: 4th confirmation slips through', async () => {
    const m = await mutantLib('phone3', 'buyerConfirmationsPerPhonePerDay: 3', 'buyerConfirmationsPerPhonePerDay: 4')
    expect(await phoneConfirmCapAllows(m, 4)).toBe(true)           // real: false
  })
  it('phone confirmation check removed', async () => {
    const m = await mutantLib('phonecheck', /    \{ column: 'phone_hash', value: phone_hash, windowMs: DAY_MS, cap: SMS_LIMITS\.buyerConfirmationsPerPhonePerDay[^\n]*\n/, '')
    expect(await phoneConfirmCapAllows(m, 6)).toBe(true)
  })
  it('verification cap 5 → 6', async () => {
    const m = await mutantLib('verify5', 'verificationCodesPerPhonePerDay: 5', 'verificationCodesPerPhonePerDay: 6')
    expect(await verifyCapAllows(m, 6)).toBe(true)
  })
  it('verification check removed', async () => {
    const m = await mutantLib('verifycheck', /    \{ column: 'phone_hash', value: phone_hash, windowMs: DAY_MS, cap: SMS_LIMITS\.verificationCodesPerPhonePerDay[^\n]*\n/, '')
    expect(await verifyCapAllows(m, 9)).toBe(true)
  })
  it('listing cap 50 → 51', async () => {
    const m = await mutantLib('listing50', 'buyerConfirmationsPerListingPerDay: 50', 'buyerConfirmationsPerListingPerDay: 51')
    expect(await listingCapAllows(m)).toBe(true)
  })
  it('listing check removed', async () => {
    const m = await mutantLib('listingcheck', /    \{ column: 'listing_id'[^\n]*\n/, '')
    expect(await listingCapAllows(m)).toBe(true)
  })
  it('IP cap 10 → 11', async () => {
    const m = await mutantLib('ip10', 'requestsPerIpPerHour: 10', 'requestsPerIpPerHour: 11')
    expect(await ipCapAllows(m, 'lead_request')).toBe(true)
  })
  it('IP check removed', async () => {
    const m = await mutantLib('ipcheck', /    \{ column: 'ip_hash'[^\n]*\n/, '')
    expect(await ipCapAllows(m, 'send_code_request')).toBe(true)
  })
  it('24h window shrunk: in-window rows stop counting', async () => {
    const m = await mutantLib('window', 'const DAY_MS = 24 * 60 * 60_000', 'const DAY_MS = 1')
    seedConf(PHONE, P1, 3)
    await new Promise(r => setTimeout(r, 5))
    expect((await m.reserveBuyerConfirmation(db.client, { phoneE164: PHONE, listingId: P1 })).ok).toBe(true)   // real: false
  })
  it('fail-closed removed (count error treated as allowed)', async () => {
    const m = await mutantLib('failopen', /if \(error \|\| typeof count !== 'number'\) \{[^]*?\n      \}\n/, "if (error || typeof count !== 'number') { continue }\n")
    db.failReads.add('sms_rate_events')
    expect((await m.reserveBuyerConfirmation(db.client, { phoneE164: PHONE, listingId: P1 })).ok).toBe(true)   // real: false
    expect((await L.reserveBuyerConfirmation(db.client, { phoneE164: PHONE, listingId: P1 })).ok).toBe(false)
  })

  it('lead route without the cap gate texts the buyer a 4th time (and the gate is in the real route)', async () => {
    const src = read('app/api/submit-lead/route.ts')
    const gate = /          : await reserveBuyerConfirmation\(supabase, \{ phoneE164, listingId: propertyId as string \}\)/
    expect(gate.test(src)).toBe(true)
    const { POST: mutant } = await import(/* @vite-ignore */ writeMutant('route_lead', src.replace(gate, '          : { ok: true as const }')))
    for (let i = 0; i < 4; i++) await lead({ routePost: mutant })
    expect(buyerTexts()).toHaveLength(4)                           // real route: 3
  })
  it('send-code route without the phone cap sends a 6th code', async () => {
    const src = read('app/api/auth/phone/send/route.ts')
    const gate = /  const phoneDecision = await reserveVerificationCode\(admin, \{ phoneE164: normalizedPhone \}\)\n  if \(!phoneDecision\.ok\) return limitResponse\(phoneDecision\.reason\)\n/
    expect(gate.test(src)).toBe(true)
    const { POST: mutant } = await import(/* @vite-ignore */ writeMutant('route_send', src.replace(gate, '')))
    for (let i = 0; i < 6; i++) await code({ post: mutant })
    expect(verifyStarted).toHaveLength(6)                          // real route: 5
  })
})
