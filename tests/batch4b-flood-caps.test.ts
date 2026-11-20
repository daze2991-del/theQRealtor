// Batch 4 follow-up: lead-form flood caps, agent alert cap, 7-day cleanup of
// sms_rate_events. Supabase, Twilio and Resend are faked — no SMS or email is
// sent and no live data is touched.

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { PGlite } from '@electric-sql/pglite'
import { makeFakeDb } from './helpers/fakeSupabase'

vi.mock('server-only', () => ({}))

let db = makeFakeDb()
vi.mock('../lib/supabase-admin', () => ({ createAdminSupabase: () => db.client }))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => db.client }))

const create = vi.fn()
vi.mock('twilio', () => ({ default: vi.fn(() => ({ messages: { create } })) }))
const sendEmail = vi.fn()
vi.mock('resend', () => ({ Resend: vi.fn(() => ({ emails: { send: sendEmail } })) }))

const L = await import('../lib/smsLimits')
const { POST: submitLead } = await import('../app/api/submit-lead/route')

const read = (p: string) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const AGENT = '99999999-9999-9999-9999-999999999999'
const AGENT_PHONE = '+14155550100'
const P1 = '11111111-1111-1111-1111-111111111111'
const P2 = '22222222-2222-2222-2222-222222222222'

function seed() {
  db.tables.properties = [P1, P2].map(id => ({ id, address: '1 Main St', agent_name: 'Jane Smith', agent_phone: null, active: true, user_id: AGENT }))
  db.tables.profiles = [{
    id: AGENT, name: 'Jane', phone: AGENT_PHONE, notify_showing: true, notify_question: true,
    quiet_hours_enabled: false, quiet_hours_start: '21:00', quiet_hours_end: '08:00', beta_joined_at: null,
    plan: 'founding', sms_alerts_enabled: true, email_alerts_enabled: true,
  }]
  db.authUsers[AGENT] = { email: 'agent@example.com' }
}

let n = 0
const ipOf = () => `203.0.113.${++n % 250}.${Math.floor(n / 250)}`
async function lead(o: { ip?: string; property?: string; post?: typeof submitLead; cta?: string; phone?: string } = {}) {
  return (o.post ?? submitLead)(new Request('https://x/api/submit-lead', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-vercel-forwarded-for': o.ip ?? ipOf(), 'user-agent': 'Mozilla/5.0' },
    body: JSON.stringify({
      propertyId: o.property ?? P1, name: 'Buyer', email: 'buyer@example.com', phone: o.phone, motivation: 'hot',
      engagement: { ctaClicked: o.cta ?? 'showing', visitCount: 1, photosViewed: 0, timeOnPageSec: 5 },
    }),
  }))
}
const agentTexts = () => create.mock.calls.filter(c => c[0].to === AGENT_PHONE)
const fill = (rows: Record<string, unknown>[], ago = 60_000) => {
  (db.tables.sms_rate_events ??= []).push(...rows.map(r => ({ allowed: true, created_at: new Date(Date.now() - ago).toISOString(), ...r })))
}

beforeEach(() => {
  db = makeFakeDb(); seed(); n = 0
  create.mockReset().mockImplementation(async () => ({ sid: 'SM', status: 'accepted', from: null }))
  sendEmail.mockReset().mockResolvedValue({ data: { id: 'em_1' }, error: null })
  process.env.TWILIO_ACCOUNT_SID = 'AC_test'; process.env.TWILIO_AUTH_TOKEN = 'token'; process.env.TWILIO_MESSAGING_SERVICE_SID = 'MG_test'
  process.env.RESEND_API_KEY = 're_test'
  for (const k of ['log', 'warn', 'error'] as const) vi.spyOn(console, k).mockImplementation(() => {})
})

// ── Scenarios, parameterised by implementation so mutation checks can reuse them ──
type Lib = typeof L
async function ipFloodAllows(lib: Lib, count = 21) {          // true if all `count` submissions from one IP pass
  let ok = true
  for (let i = 0; i < count; i++) ok = (await lib.reserveLeadSubmission(db.client, '198.51.100.7')).ok && ok
  return ok
}
async function listingAllows(lib: Lib) {                       // 31st lead on one listing within the hour
  fill(Array.from({ length: 30 }, () => ({ kind: 'lead_listing', listing_id: P1 })))
  return (await lib.reserveListingLead(db.client, P1)).ok
}
async function agentAllows(lib: Lib) {                         // 21st alert text for one agent within the hour
  fill(Array.from({ length: 20 }, () => ({ kind: 'agent_alert', agent_id: AGENT })))
  return (await lib.reserveAgentAlert(db.client, AGENT)).ok
}

// ── 1a. Per-IP lead flood cap ────────────────────────────────────────────────
describe('lead flood cap per IP (20/hour, all listings)', () => {
  it('lib: 20 allowed, the 21st refused', async () => {
    expect(await ipFloodAllows(L, 20)).toBe(true)
    expect(await L.reserveLeadSubmission(db.client, '198.51.100.7')).toEqual({ ok: false, reason: 'ip_cap' })
  })
  it('route: 21st submission from one IP across two listings gets the friendly message and is NOT saved', async () => {
    const ip = '198.51.100.20'
    for (let i = 0; i < 20; i++) expect((await lead({ ip, property: i % 2 ? P1 : P2 })).status).toBe(200)
    expect(db.tables.leads).toHaveLength(20)
    const res = await lead({ ip })
    expect(res.status).toBe(429)
    expect((await res.json()).error).toBe('Too many submissions, please try again later.')
    expect(db.tables.leads).toHaveLength(20)                      // not saved
  })
  it('another IP is unaffected, and the hour window expires', async () => {
    const ip = '198.51.100.21'
    fill(Array.from({ length: 20 }, () => ({ kind: 'lead_submission', ip_hash: require_hash(ip) })))
    expect((await lead({ ip: '198.51.100.22' })).status).toBe(200)
    expect((await lead({ ip })).status).toBe(429)
    db.tables.sms_rate_events.forEach(r => { r.created_at = new Date(Date.now() - 61 * 60_000).toISOString() })
    expect((await lead({ ip })).status).toBe(200)
  })
  it('refused submissions do not extend the lockout (kept as audit rows, flagged not-allowed)', async () => {
    const ip = '198.51.100.23'
    for (let i = 0; i < 25; i++) await lead({ ip })
    const rows = db.tables.sms_rate_events.filter(r => r.kind === 'lead_submission')
    expect(rows.filter(r => r.allowed).length).toBe(20)
    expect(rows.filter(r => !r.allowed).length).toBe(5)
  })
  it('if the counter cannot be read the lead is still saved, but no agent text goes out (fail closed on SMS)', async () => {
    db.failReads.add('sms_rate_events')
    expect((await lead({ cta: 'showing' })).status).toBe(200)
    expect(db.tables.leads).toHaveLength(1)
    expect(agentTexts()).toHaveLength(0)
    expect(sendEmail).toHaveBeenCalledTimes(1)                    // email still goes
  })
  it('stores a hash, never the raw IP', async () => {
    await lead({ ip: '198.51.100.24' })
    expect(JSON.stringify(db.tables.sms_rate_events)).not.toContain('198.51.100.24')
  })
})

// ── 1b. Per-listing lead cap ─────────────────────────────────────────────────
describe('lead cap per listing (30/hour, all IPs)', () => {
  it('lib: 30 allowed, the 31st refused; other listings unaffected', async () => {
    expect(await listingAllows(L)).toBe(false)
    expect((await L.reserveListingLead(db.client, P2)).ok).toBe(true)
  })
  it('route: with 30 leads already this hour, the next lead is saved and emailed but NOT texted; another listing still texts', async () => {
    // (Seeded rather than looped: one agent's own 20/hour text cap would stop a loop first.)
    fill(Array.from({ length: 30 }, () => ({ kind: 'lead_listing', listing_id: P1 })))
    expect((await lead({ property: P1 })).status).toBe(200)
    expect(db.tables.leads).toHaveLength(1)                                     // saved → on the dashboard
    expect(agentTexts()).toHaveLength(0)                                        // no agent text
    expect(sendEmail).toHaveBeenCalledTimes(1)                                  // email still sent
    expect((await lead({ property: P2 })).status).toBe(200)
    expect(agentTexts()).toHaveLength(1)
  })
})

// ── 2. Per-agent alert cap ───────────────────────────────────────────────────
describe('agent alert cap (20 texts/hour, all listings)', () => {
  it('lib: 20 allowed, the 21st refused', async () => {
    expect(await agentAllows(L)).toBe(false)
  })
  it('route: leads across two listings — 21st+ alert is not texted but is saved and emailed', async () => {
    for (let i = 0; i < 25; i++) expect((await lead({ property: i % 2 ? P1 : P2 })).status).toBe(200)
    expect(agentTexts()).toHaveLength(20)
    expect(db.tables.leads).toHaveLength(25)
    expect(sendEmail).toHaveBeenCalledTimes(25)
  })
  it('another agent is unaffected, and the window is one hour', async () => {
    fill(Array.from({ length: 20 }, () => ({ kind: 'agent_alert', agent_id: AGENT })))
    expect((await L.reserveAgentAlert(db.client, 'someone-else')).ok).toBe(true)
    expect((await L.reserveAgentAlert(db.client, AGENT)).ok).toBe(false)
    db.tables.sms_rate_events.forEach(r => { r.created_at = new Date(Date.now() - 61 * 60_000).toISOString() })
    expect((await L.reserveAgentAlert(db.client, AGENT)).ok).toBe(true)
  })
  it('the 100/day founder alarm is unchanged and only counts texts that went out', async () => {
    for (let i = 0; i < 22; i++) await lead()
    expect(agentTexts()).toHaveLength(20)
    expect(db.tables.sms_send_log).toHaveLength(20)               // skipped alerts never reach it
    const tw = read('lib/twilio.ts')
    expect(tw).toContain('if (count === 100)')
    expect(tw).toContain("has sent 100+ SMS alerts today")
  })
  it('fails closed: unreadable counter means no agent text', async () => {
    db.failReads.add('sms_rate_events')
    const { queueOrSendAgentSms } = await import('../lib/twilio')
    const r = await queueOrSendAgentSms({
      admin: db.client, agent: { id: AGENT, quiet_hours_enabled: false, quiet_hours_start: '21:00', quiet_hours_end: '08:00', plan: 'founding', sms_alerts_enabled: true },
      agentPhone: AGENT_PHONE, leadId: 'l1', message: 'x', alertType: 'showingAlert',
    })
    expect(r).toBe('rate_limited')
    expect(create).not.toHaveBeenCalled()
  })
})

// ── 3. Cleanup: sms_rate_events older than 7 days, via the existing daily job ─
describe('retention: sms_rate_events older than 7 days (migration 072)', () => {
  const m071 = read('supabase/migrations/071_sms_rate_events.sql')
  const m072 = read('supabase/migrations/072_flood_caps_and_rate_event_cleanup.sql')

  async function pg() {
    const d = new PGlite()
    await d.exec(`
      create role anon; create role authenticated; create role service_role;
      create table public.other_table (id int, created_at timestamptz default now() - interval '10 years');
      insert into public.other_table values (1), (2);
      -- stand-in for migration 064's function: records that it ran, touches nothing here
      create function public.run_retention_cleanup(integer, integer, boolean) returns jsonb language sql as $$ select '{"core_ran": true}'::jsonb $$;
    `)
    await d.exec(m071)
    await d.exec(m072)
    return d
  }
  const seedRows = (d: PGlite) => d.exec(`
    insert into public.sms_rate_events (kind, created_at) values
      ('lead_submission', now() - interval '8 days'), ('agent_alert', now() - interval '7 days 1 hour'),
      ('lead_listing', now() - interval '6 days 23 hours'), ('lead_submission', now());`)

  it('deletes only rows older than 7 days, leaves other tables alone, keeps the core job running', async () => {
    const d = await pg(); await seedRows(d)
    const r = await d.query<{ r: any }>('select public.run_retention_cleanup() as r')
    expect(r.rows[0].r).toMatchObject({ core_ran: true, sms_rate_events: 2 })
    expect((await d.query('select count(*)::int c from public.sms_rate_events')).rows[0]).toEqual({ c: 2 })
    expect((await d.query('select count(*)::int c from public.other_table')).rows[0]).toEqual({ c: 2 })
  })
  it('dry run deletes nothing and idempotent re-run deletes nothing more', async () => {
    const d = await pg(); await seedRows(d)
    const dry = await d.query<{ r: any }>('select public.run_retention_cleanup(5000, 20, true) as r')
    expect(dry.rows[0].r.sms_rate_events).toBe(2)
    expect((await d.query('select count(*)::int c from public.sms_rate_events')).rows[0]).toEqual({ c: 4 })
    await d.query('select public.run_retention_cleanup()')
    const again = await d.query<{ r: any }>('select public.run_retention_cleanup() as r')
    expect(again.rows[0].r.sms_rate_events).toBe(0)
  })
  it('re-applying the migration is safe (rename is guarded) and the cron command still resolves', async () => {
    const d = await pg()
    await d.exec(m072)
    expect((await d.query<{ r: any }>('select public.run_retention_cleanup() as r')).rows[0].r.core_ran).toBe(true)
  })
  it('batches are bounded: with a tiny batch size only part is deleted per run', async () => {
    const d = await pg()
    await d.exec(`insert into public.sms_rate_events (kind, created_at) select 'x', now() - interval '9 days' from generate_series(1, 25)`)
    const r = await d.query<{ r: any }>('select public.run_retention_cleanup(10, 2, false) as r')
    expect(r.rows[0].r.sms_rate_events).toBe(20)
  })
  it('migration text: adds only a nullable column, no other retention changed, service-role only', () => {
    const code = m072.split('\n').map(l => l.replace(/--.*$/, '')).join('\n')
    expect(code).toContain('add column if not exists agent_id uuid;')
    expect(code).toContain("interval '7 days'")
    for (const t of ['scan_events', 'sms_consent_events', 'sms_contacts', 'public.leads', 'retention_runs', 'auto_renewal_consents'])
      expect(code).not.toContain(t)
    expect(code).toContain('from public, anon, authenticated')
    expect(code).not.toMatch(/grant [^;]* to (anon|authenticated|public)/)
    expect(read('supabase/migrations/064_retention_cleanup.sql')).toContain("select cron.schedule('retention-cleanup', '0 10 * * *', $cron$select public.run_retention_cleanup()$cron$)")
  })
})

// ── Mutation checks ──────────────────────────────────────────────────────────
describe('mutation checks', () => {
  const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
  const MUT = new URL('./__mutants_4b__/', import.meta.url)
  mkdirSync(MUT, { recursive: true })
  const absolutize = (src: string) => src
    .replace(/from '((?:\.\.\/)+)([^']+)'/g, `from '${ROOT}/$2'`)
    .replace(/from '\.\/([^']+)'/g, `from '${ROOT}/lib/$1'`)
  const writeMutant = (name: string, src: string) => { writeFileSync(new URL(name + '.ts', MUT), absolutize(src)); return new URL(name + '.ts', MUT).pathname }
  const mutate = async (file: string, name: string, from: string | RegExp, to: string) => {
    const src = read(file)
    expect(typeof from === 'string' ? src.includes(from) : from.test(src)).toBe(true)     // mutation must apply
    const out = src.replace(from, to)
    expect(out).not.toBe(src)
    return import(/* @vite-ignore */ writeMutant(name, out))
  }
  afterAll(() => rmSync(MUT, { recursive: true, force: true }))

  it('IP flood cap 20 → 21', async () => {
    const m = await mutate('lib/smsLimits.ts', 'ip20', 'leadSubmissionsPerIpPerHour: 20', 'leadSubmissionsPerIpPerHour: 21')
    expect(await ipFloodAllows(m, 21)).toBe(true)                 // real: false
  })
  it('IP flood check removed', async () => {
    const m = await mutate('lib/smsLimits.ts', 'ipcheck', /    \{ column: 'ip_hash', value: ip_hash, windowMs: HOUR_MS, cap: SMS_LIMITS\.leadSubmissionsPerIpPerHour[^\n]*\n/, '')
    expect(await ipFloodAllows(m, 30)).toBe(true)
  })
  it('listing cap 30 → 31', async () => {
    const m = await mutate('lib/smsLimits.ts', 'list30', 'leadsPerListingPerHour: 30', 'leadsPerListingPerHour: 31')
    expect(await listingAllows(m)).toBe(true)
  })
  it('listing check removed', async () => {
    const m = await mutate('lib/smsLimits.ts', 'listcheck', /    \{ column: 'listing_id', value: listingId, windowMs: HOUR_MS[^\n]*\n/, '')
    expect(await listingAllows(m)).toBe(true)
  })
  it('agent cap 20 → 21', async () => {
    const m = await mutate('lib/smsLimits.ts', 'agent20', 'agentAlertsPerAgentPerHour: 20', 'agentAlertsPerAgentPerHour: 21')
    expect(await agentAllows(m)).toBe(true)
  })
  it('agent check removed', async () => {
    const m = await mutate('lib/smsLimits.ts', 'agentcheck', /    \{ column: 'agent_id'[^\n]*\n/, '')
    expect(await agentAllows(m)).toBe(true)
  })
  it('hour window shrunk: in-window rows stop counting', async () => {
    const m = await mutate('lib/smsLimits.ts', 'hour', 'const HOUR_MS = 60 * 60_000', 'const HOUR_MS = 1')
    fill(Array.from({ length: 20 }, () => ({ kind: 'agent_alert', agent_id: AGENT })))
    await new Promise(r => setTimeout(r, 5))
    expect((await m.reserveAgentAlert(db.client, AGENT)).ok).toBe(true)      // real: false
  })

  it('route without the IP flood gate saves the 21st lead (and the gate is in the real route)', async () => {
    const gate = /  if \(!floodDecision\.ok && floodDecision\.reason === 'ip_cap'\) \{/
    const { POST: m } = await mutate('app/api/submit-lead/route.ts', 'route_flood', gate, "  if (false) {")
    for (let i = 0; i < 21; i++) await lead({ ip: '198.51.100.30', post: m })
    expect(db.tables.leads).toHaveLength(21)                       // real route: 20
  })
  it('route without the listing gate texts the agent although the listing is over its cap', async () => {
    const { POST: m } = await mutate('app/api/submit-lead/route.ts', 'route_listing',
      'const agentSmsAllowed = floodDecision.ok && listingDecision.ok', 'const agentSmsAllowed = floodDecision.ok')
    fill(Array.from({ length: 30 }, () => ({ kind: 'lead_listing', listing_id: P1 })))
    await lead({ post: m, property: P1 })
    expect(agentTexts()).toHaveLength(1)                           // real route: 0
  })
  it('agent cap gate removed from queueOrSendAgentSms: a 21st text goes out', async () => {
    const tw = await mutate('lib/twilio.ts', 'twilio_nocap', /  const cap = await reserveAgentAlert\(admin, agent\.id\)\n  if \(!cap\.ok\) \{[^]*?\n  \}\n/, '')
    const send = (lib: any) => lib.queueOrSendAgentSms({
      admin: db.client, agent: { id: AGENT, quiet_hours_enabled: false, quiet_hours_start: '21:00', quiet_hours_end: '08:00', plan: 'founding', sms_alerts_enabled: true },
      agentPhone: AGENT_PHONE, leadId: 'l1', message: 'x', alertType: 'showingAlert',
    })
    let sent = 0
    for (let i = 0; i < 21; i++) if ((await send(tw)) === 'sent') sent++
    expect(sent).toBe(21)                                          // real: 20 (see below)
    create.mockClear(); db.tables.sms_rate_events = []
    const real = await import('../lib/twilio')
    let realSent = 0
    for (let i = 0; i < 21; i++) if ((await send(real)) === 'sent') realSent++
    expect(realSent).toBe(20)
  })
})

import { createHash } from 'crypto'
function require_hash(v: string) { return createHash('sha256').update(v).digest('hex') }
