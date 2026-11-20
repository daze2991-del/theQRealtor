// Batch 5: error alerts (lib/errorAlerts.ts, instrumentation.ts, migration 073,
// app/error.tsx, app/global-error.tsx). Supabase and Resend are faked — no email
// is sent, no live data is touched.

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { PGlite } from '@electric-sql/pglite'
import { makeFakeDb } from './helpers/fakeSupabase'

vi.mock('server-only', () => ({}))
let db = makeFakeDb()
vi.mock('../lib/supabase-admin', () => ({ createAdminSupabase: () => db.client }))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => db.client }))
const send = vi.fn()
vi.mock('resend', () => ({ Resend: vi.fn(() => ({ emails: { send } })) }))
vi.mock('twilio', () => ({ default: vi.fn(() => ({ messages: { create: vi.fn() } })) }))

const A = await import('../lib/errorAlerts')
const { onRequestError } = await import('../instrumentation')
const { POST: webhook } = await import('../app/api/stripe/webhook/route')
const { GET: cron } = await import('../app/api/cron/flush-notifications/route')
const { flushDueNotifications } = await import('../lib/twilio')
const ErrorPage = (await import('../components/ErrorPage')).default
const AppError = (await import('../app/error')).default
const GlobalError = (await import('../app/global-error')).default

const read = (p: string) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
type Lib = typeof A
const sent = () => send.mock.calls.map(c => c[0])
const age = (ms: number) => (db.tables.error_alert_events ?? []).forEach(r => { r.created_at = new Date(Date.parse(r.created_at) - ms).toISOString() })

beforeEach(() => {
  db = makeFakeDb(); A.__resetErrorAlertMemory()
  send.mockReset().mockResolvedValue({ data: { id: 'em_1' }, error: null })
  process.env.RESEND_API_KEY = 're_test'; process.env.VERCEL_DEPLOYMENT_ID = 'dpl_TEST123'
  process.env.NEXT_RUNTIME = 'nodejs'; delete process.env.CRON_SECRET
  for (const k of ['log', 'warn', 'error'] as const) vi.spyOn(console, k).mockImplementation(() => {})
})

// Scenarios reused by the mutation checks (take the implementation as a parameter).
async function emailsForRepeats(lib: Lib, n = 3) {          // same error n times → how many emails
  for (let i = 0; i < n; i++) { lib.__resetErrorAlertMemory(); await lib.sendErrorAlert({ route: '/api/x', message: 'db exploded' }) }
  return sent().length
}
async function emailsForDistinct(lib: Lib, n = 22) {        // n different errors → how many emails
  for (let i = 0; i < n; i++) { lib.__resetErrorAlertMemory(); await lib.sendErrorAlert({ route: `/api/r${i}`, message: 'boom' }) }
  return sent().length
}
const PII = 'Buyer jane.doe@example.com phone +1 (310) 555-0142 token abcdefghijklmnopqrstuvwxyz123456 name \'Jane Smith\' Key (phone)=(3105550142)'

// ── 1. The alert itself ──────────────────────────────────────────────────────
describe('alert content', () => {
  it('goes to hello@theqrealtor.com with time (Los Angeles), route, error and deployment id', async () => {
    expect(await A.sendErrorAlert({ route: '/api/properties', message: 'relation "leads" does not exist' })).toBe('sent')
    const [m] = sent()
    expect(m.to).toBe('hello@theqrealtor.com')
    expect(m.subject).toContain('/api/properties')
    expect(m.text).toMatch(/^Time \(Los Angeles\): .*\b(PST|PDT)$/m)
    expect(m.text).toContain('Route: /api/properties')
    expect(m.text).toContain('Error: relation "leads" does not exist')
    expect(m.text).toContain('Deployment: dpl_TEST123')
    expect(m.text.split('\n')).toHaveLength(4)                    // nothing else: no stack, no body, no headers
  })
  it('contains no names, phone numbers, emails or tokens', async () => {
    await A.sendErrorAlert({ route: '/api/report/[token]', message: PII })
    const dump = JSON.stringify(sent())
    for (const bad of ['jane.doe', 'example.com', '310', '5550142', 'abcdefghijklmnopqrstuvwxyz', 'Jane Smith', 'Jane'])
      expect(dump).not.toContain(bad)
    expect(sent()[0].text).toContain("'[value]'")
  })
  it('throttle table stores only a fingerprint and the route template — never the message', async () => {
    await A.sendErrorAlert({ route: '/api/report/[token]', message: PII })
    const dump = JSON.stringify(db.tables.error_alert_events)
    expect(dump).not.toMatch(/jane|555|abcdefgh/i)
    expect(Object.keys(db.tables.error_alert_events[0]).sort()).toEqual(['allowed', 'created_at', 'fingerprint', 'id', 'route'])
  })
  it('a thrown route error uses the route template, not the real URL (which holds a report token)', async () => {
    const handler = A.withErrorAlerts('/api/report/[token]', async (_req: Request) => { throw new Error('kaboom') })
    await expect(handler(new Request('https://x/api/report/SECRETTOKEN1234567890abcdefghij?name=Jane'))).rejects.toThrow('kaboom')
    expect(sent()).toHaveLength(1)
    expect(sent()[0].text).toContain('Route: /api/report/[token]')
    expect(JSON.stringify(sent())).not.toMatch(/SECRETTOKEN|Jane/)
  })
  it('instrumentation onRequestError (Next 15+) alerts using routePath and ignores the real path and headers', async () => {
    await onRequestError(new Error('render failed'),
      { path: '/report/SECRETTOKEN1234567890abcdefghij', method: 'GET', headers: { cookie: 'sb=SECRET' } },
      { routePath: '/report/[token]', routeType: 'render', routerKind: 'App Router' })
    expect(sent()).toHaveLength(1)
    expect(sent()[0].text).toContain('Route: /report/[token]')
    expect(JSON.stringify(sent())).not.toMatch(/SECRETTOKEN|SECRET|cookie/)
  })
  it("Next's redirect/notFound control-flow throws are not alerted", async () => {
    await A.reportError('/x', Object.assign(new Error('NEXT_REDIRECT'), { digest: 'NEXT_REDIRECT;replace;/a;307;' }))
    expect(sent()).toHaveLength(0)
  })
})

// ── 2. Throttle ──────────────────────────────────────────────────────────────
describe('throttle', () => {
  it('one email per distinct error per hour; a different error still gets through', async () => {
    expect(await emailsForRepeats(A, 3)).toBe(1)
    A.__resetErrorAlertMemory()
    await A.sendErrorAlert({ route: '/api/x', message: 'a different failure' })
    expect(sent()).toHaveLength(2)
  })
  it('same route + same message with different numbers/ids is the same error', async () => {
    await A.sendErrorAlert({ route: '/api/x', message: 'timeout after 3000ms for 11111111-1111-1111-1111-111111111111' }); A.__resetErrorAlertMemory()
    await A.sendErrorAlert({ route: '/api/x', message: 'timeout after 4500ms for 22222222-2222-2222-2222-222222222222' })
    expect(sent()).toHaveLength(1)
  })
  it('the same error can alert again after an hour', async () => {
    await emailsForRepeats(A, 2); age(61 * 60_000)
    A.__resetErrorAlertMemory()
    await A.sendErrorAlert({ route: '/api/x', message: 'db exploded' })
    expect(sent()).toHaveLength(2)
  })
  it('at most 20 emails a day across all errors; resumes after 24h', async () => {
    expect(await emailsForDistinct(A, 22)).toBe(20)
    age(25 * 3_600_000); A.__resetErrorAlertMemory()
    await A.sendErrorAlert({ route: '/api/fresh', message: 'new' })
    expect(sent()).toHaveLength(21)
  })
  it('refused attempts are flagged and do not use up the cap', async () => {
    await emailsForRepeats(A, 5)
    expect(db.tables.error_alert_events.filter(r => r.allowed)).toHaveLength(1)
  })
  it('an error storm in one instance only touches the database once per minute per error', async () => {
    for (let i = 0; i < 50; i++) await A.sendErrorAlert({ route: '/api/x', message: 'storm' })
    expect(db.tables.error_alert_events).toHaveLength(1)
    expect(sent()).toHaveLength(1)
  })
})

// ── 3. Alerting never breaks the request ─────────────────────────────────────
describe('failure isolation', () => {
  const okHandler = A.withErrorAlerts('/api/ok', async () => new Response('fine', { status: 200 }))
  it('Resend failing: request result unchanged, thrown error is still the original', async () => {
    send.mockRejectedValue(new Error('resend is down'))
    const boom = A.withErrorAlerts('/api/y', async () => { throw new Error('original failure') })
    await expect(boom()).rejects.toThrow('original failure')
    send.mockResolvedValue({ data: null, error: { message: 'rejected' } }); A.__resetErrorAlertMemory()
    await expect(boom()).rejects.toThrow('original failure')
    expect(await (await okHandler()).text()).toBe('fine')
  })
  it('throttle table unreadable / unwritable: nothing thrown, no email', async () => {
    db.failReads.add('error_alert_events')
    const boom = A.withErrorAlerts('/api/y', async () => { throw new Error('original failure') })
    await expect(boom()).rejects.toThrow('original failure')
    expect(sent()).toHaveLength(0)
    db.failReads.clear(); A.__resetErrorAlertMemory()
    const realFrom = db.client.from
    db.client.from = () => { throw new Error('db down') }
    await expect(boom()).rejects.toThrow('original failure')
    db.client.from = realFrom
    expect(sent()).toHaveLength(0)
  })
  it('no RESEND_API_KEY: logs and moves on', async () => {
    delete process.env.RESEND_API_KEY
    expect(await A.sendErrorAlert({ route: '/api/x', message: 'm' })).toBe('failed')
  })
  it('Resend hanging forever cannot hold a request more than ~2.5s', async () => {
    send.mockImplementation(() => new Promise(() => {}))
    const t = Date.now()
    expect(await A.sendErrorAlert({ route: '/api/x', message: 'hang' })).toBe('timeout')
    expect(Date.now() - t).toBeLessThan(A.ALERT_TIMEOUT_MS + 700)
  }, 8000)
  it('a normal response is never touched or delayed', async () => {
    const t = Date.now(); const r = await okHandler()
    expect(r.status).toBe(200); expect(Date.now() - t).toBeLessThan(100); expect(sent()).toHaveLength(0)
  })
})

// ── 4. Stripe webhook, daily cron, notification flush ────────────────────────
describe('what else alerts', () => {
  const hook = (headers: Record<string, string> = {}) => webhook(new Request('https://x/api/stripe/webhook', { method: 'POST', headers, body: '{"customer_email":"jane@example.com"}' }))
  it('Stripe webhook: bad or missing signature 400s do NOT alert and do not use the daily cap', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_x'; process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test'
    expect((await hook()).status).toBe(400)                                             // Missing signature
    A.__resetErrorAlertMemory()
    expect((await hook({ 'stripe-signature': 't=1,v1=bad' })).status).toBe(400)         // Invalid signature
    expect(sent()).toHaveLength(0)
    expect(db.tables.error_alert_events ?? []).toHaveLength(0)
  })
  it('Stripe webhook: every other non-2xx still alerts (route + status + reason, no payload)', async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET
    const res = await hook({ 'stripe-signature': 't=1,v1=x' })
    expect(res.status).toBe(500)
    expect(sent()).toHaveLength(1)
    expect(sent()[0].text).toContain('Route: /api/stripe/webhook')
    expect(sent()[0].text).toContain('Error: Responded 500: Webhook not configured')
    expect(JSON.stringify(sent())).not.toContain('jane')
  })
  it('webhookShouldAlert rule: 2xx no; signature 400s no; other 400s and 5xx yes', () => {
    const src = read('app/api/stripe/webhook/route.ts')
    const fn = new Function('SIGNATURE_400', src.match(/function webhookShouldAlert[^]*?\n\}/)![0].replace(/: (number|string|boolean)/g, '') + '; return webhookShouldAlert')(new Set(['Missing signature', 'Invalid signature']))
    expect([fn(200, ''), fn(400, 'Missing signature'), fn(400, 'Invalid signature')]).toEqual([false, false, false])
    expect([fn(400, 'Something else'), fn(401, 'Missing signature'), fn(500, 'Invalid signature'), fn(500, 'Processing failed'), fn(302, '')]).toEqual([true, true, true, true, true])
  })
  it('a 2xx webhook response does not alert', async () => {
    const h = A.withErrorAlerts('/api/stripe/webhook', async () => Response.json({ ok: true }), { alertOn: (s, d) => s !== 200 && d !== 'x' })
    expect((await h()).status).toBe(200); expect(sent()).toHaveLength(0)
    expect(read('app/api/stripe/webhook/route.ts')).toContain("withErrorAlerts('/api/stripe/webhook', POST__handler, { alertOn: webhookShouldAlert })")
  })
  it('daily cron failing (500) alerts; an unauthorized probe (401) does not', async () => {
    db.failReads.add('pending_notifications')
    const res = await cron(new Request('https://x/api/cron/flush-notifications'))
    expect(res.status).toBe(500)
    expect(sent().some(m => m.text.includes('Route: /api/cron/flush-notifications'))).toBe(true)
    send.mockClear(); A.__resetErrorAlertMemory(); process.env.CRON_SECRET = 's3cret'
    expect((await cron(new Request('https://x/api/cron/flush-notifications'))).status).toBe(401)
    expect(sent()).toHaveLength(0)
  })
  it('a failing notification flush (also on the lead / dashboard paths) alerts', async () => {
    db.failReads.add('pending_notifications')
    const r = await flushDueNotifications(db.client, { agentId: 'a1' })
    expect(r.error).toBeTruthy()
    expect(sent()).toHaveLength(1)
    expect(sent()[0].text).toContain('Route: notification flush')
  })
  it('every API route handler is wrapped', () => {
    const { execSync } = require('child_process')
    const files = execSync("find app -name route.ts", { cwd: new URL('..', import.meta.url).pathname }).toString().trim().split('\n')
    for (const f of files) {
      const s = read(f)
      expect(s, f).not.toMatch(/^export (async )?function (GET|POST|PUT|PATCH|DELETE)\(/m)
      expect(s, f).toContain('withErrorAlerts(')
    }
  })
})

// ── 5. Error pages ───────────────────────────────────────────────────────────
describe('error pages', () => {
  const err = Object.assign(new Error('secret db failure at /srv/app/lib/x.ts:42'), { digest: 'DIGEST999', stack: 'Error: secret\n    at Object.<anonymous> (/srv/app.js:1:1)' })
  const walk = (n: any, f: (n: any) => void) => { if (!n || typeof n !== 'object') return; f(n); const c = n.props?.children; (Array.isArray(c) ? c : [c]).forEach(x => walk(x, f)) }
  for (const [name, el] of [
    ['app/error.tsx', () => createElement(AppError, { error: err, reset: () => {} })],
    ['app/global-error.tsx', () => createElement(GlobalError, { error: err, reset: () => {} })],
  ] as const) {
    it(`${name}: friendly branded page, retry button, link home, no error details`, () => {
      const html = renderToStaticMarkup(el())
      expect(html).toContain('Something went wrong.')
      expect(html).toContain('Please try again.')
      expect(html).toContain('<button')
      expect(html).toMatch(/<a href="\/"[^>]*>Go to the home page<\/a>/)
      expect(html).toContain('qr</span>')                        // brand mark
      for (const leak of ['secret', 'DIGEST999', '/srv/', 'stack', 'at Object']) expect(html).not.toContain(leak)
    })
  }
  it('global-error supplies its own <html> and <body>', () => {
    expect(renderToStaticMarkup(createElement(GlobalError, { error: err, reset: () => {} }))).toMatch(/^<html lang="en"><body/)
  })
  it('the retry button calls reset', () => {
    const reset = vi.fn(); let onClick: any
    walk((ErrorPage as any)({ reset }), n => { if (n.type === 'button') onClick = n.props.onClick })
    onClick(); expect(reset).toHaveBeenCalledTimes(1)
  })
})

// ── 6. Migration 073 ─────────────────────────────────────────────────────────
describe('migration 073', () => {
  const m = ['071_sms_rate_events.sql', '072_flood_caps_and_rate_event_cleanup.sql', '073_error_alert_events.sql'].map(f => read('supabase/migrations/' + f))
  async function pg() {
    const d = new PGlite()
    await d.exec(`create role anon; create role authenticated; create role service_role;
      create table public.other_table (id int, created_at timestamptz default now() - interval '10 years'); insert into public.other_table values (1);
      create function public.run_retention_cleanup(integer, integer, boolean) returns jsonb language sql as $$ select '{"core_ran": true}'::jsonb $$;`)
    for (const s of m) await d.exec(s)
    return d
  }
  it('RLS on, nothing for anon/authenticated, service role can read/write', async () => {
    const d = await pg()
    expect((await d.query<any>("select relrowsecurity r from pg_class where oid = 'public.error_alert_events'::regclass")).rows[0].r).toBe(true)
    for (const role of ['anon', 'authenticated'])
      for (const priv of ['select', 'insert', 'update', 'delete'])
        expect((await d.query<any>(`select has_table_privilege('${role}', 'public.error_alert_events', '${priv}') h`)).rows[0].h).toBe(false)
    for (const priv of ['select', 'insert', 'update'])
      expect((await d.query<any>(`select has_table_privilege('service_role', 'public.error_alert_events', '${priv}') h`)).rows[0].h).toBe(true)
    expect((await d.query<any>('select count(*)::int c from public.error_alert_events')).rows[0].c).toBe(0)   // empty: no rows changed
  })
  it('daily job prunes error_alert_events and sms_rate_events at 7 days and nothing else; dry run deletes nothing', async () => {
    const d = await pg()
    await d.exec(`insert into public.error_alert_events (fingerprint, route, created_at) values ('a','/x', now() - interval '8 days'), ('b','/x', now() - interval '1 day');
                  insert into public.sms_rate_events (kind, created_at) values ('k', now() - interval '8 days'), ('k', now());`)
    const dry = (await d.query<any>('select public.run_retention_cleanup(5000, 20, true) r')).rows[0].r
    expect(dry).toMatchObject({ core_ran: true, sms_rate_events: 1, error_alert_events: 1 })
    expect((await d.query<any>('select count(*)::int c from public.error_alert_events')).rows[0].c).toBe(2)
    const real = (await d.query<any>('select public.run_retention_cleanup() r')).rows[0].r
    expect(real).toMatchObject({ core_ran: true, sms_rate_events: 1, error_alert_events: 1 })
    expect((await d.query<any>('select count(*)::int c from public.error_alert_events')).rows[0].c).toBe(1)
    expect((await d.query<any>('select count(*)::int c from public.other_table')).rows[0].c).toBe(1)
  })
})

// ── Mutation checks (the throttle, plus the scrubber and the webhook gate) ───
describe('mutation checks', () => {
  const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
  const MUT = new URL('./__mutants_5__/', import.meta.url)
  mkdirSync(MUT, { recursive: true })
  const absolutize = (src: string) => src
    .replace(/from '((?:\.\.\/)+)([^']+)'/g, `from '${ROOT}/$2'`)
    .replace(/from '\.\/([^']+)'/g, `from '${ROOT}/lib/$1'`)
    .replace(/import\('\.\/([^']+)'\)/g, `import('${ROOT}/lib/$1')`)
  const mutate = async (file: string, name: string, from: string | RegExp, to: string) => {
    const src = read(file)
    expect(typeof from === 'string' ? src.includes(from) : from.test(src)).toBe(true)
    const out = src.replace(from, to); expect(out).not.toBe(src)
    const path = new URL(name + '.ts', MUT).pathname
    writeFileSync(path, absolutize(out))
    return import(/* @vite-ignore */ path)
  }
  afterAll(() => rmSync(MUT, { recursive: true, force: true }))

  it('real code: 1 email for 3 repeats, 20 for 22 distinct (baseline for the mutants)', async () => {
    expect(await emailsForRepeats(A, 3)).toBe(1)
    db = makeFakeDb(); send.mockClear()
    expect(await emailsForDistinct(A, 22)).toBe(20)
  })
  it('per-fingerprint limit 1 → 2: a repeat slips through', async () => {
    const m = await mutate('lib/errorAlerts.ts', 'fp2', 'perFingerprintPerHour: 1', 'perFingerprintPerHour: 2')
    expect(await emailsForRepeats(m, 3)).toBe(2)                // real: 1
  })
  it('per-fingerprint check removed: every repeat is emailed', async () => {
    const m = await mutate('lib/errorAlerts.ts', 'fpcheck', "if (hour.count > ERROR_ALERT_LIMITS.perFingerprintPerHour) return refuse('fingerprint')", '')
    expect(await emailsForRepeats(m, 3)).toBe(3)
  })
  it('daily cap 20 → 21', async () => {
    const m = await mutate('lib/errorAlerts.ts', 'day21', 'perDay: 20', 'perDay: 21')
    expect(await emailsForDistinct(m, 22)).toBe(21)             // real: 20
  })
  it('daily check removed: all 22 are emailed', async () => {
    const m = await mutate('lib/errorAlerts.ts', 'daycheck', "if (day.count > ERROR_ALERT_LIMITS.perDay) return refuse('daily_cap')", '')
    expect(await emailsForDistinct(m, 22)).toBe(22)
  })
  it('hour window shrunk: a same-hour repeat is emailed again', async () => {
    const m = await mutate('lib/errorAlerts.ts', 'hourwin', 'const HOUR_MS = 60 * 60_000', 'const HOUR_MS = 1')
    m.__resetErrorAlertMemory(); await m.sendErrorAlert({ route: '/api/x', message: 'e' })
    await new Promise(r => setTimeout(r, 5)); m.__resetErrorAlertMemory(); await m.sendErrorAlert({ route: '/api/x', message: 'e' })
    expect(sent()).toHaveLength(2)                              // real: 1
  })
  it('fail-closed removed (unreadable throttle table → send anyway)', async () => {
    const m = await mutate('lib/errorAlerts.ts', 'failopen', /  \} catch \(err: any\) \{\n    console\.error\('\[errorAlerts\] throttle check failed:'[^]*?return \{ ok: false, reason: 'check_failed' \}\n  \}/, "  } catch { return { ok: true } }")
    db.failReads.add('error_alert_events')
    await m.sendErrorAlert({ route: '/api/x', message: 'e' })
    expect(sent()).toHaveLength(1)                              // real: 0
  })
  it('scrubber disabled: personal data leaks into the email (so the privacy test is real)', async () => {
    const m = await mutate('lib/errorAlerts.ts', 'noscrub', /export function scrub\(input: unknown, max = 300\): string \{/, 'export function scrub(input: unknown, max = 300): string { return String(input)\n')
    await m.sendErrorAlert({ route: '/api/x', message: PII })
    expect(JSON.stringify(sent())).toContain('jane.doe@example.com')       // real: scrubbed
  })
  it('webhook without the alert gate sends nothing for a 500', async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET
    const { POST } = await mutate('app/api/stripe/webhook/route.ts', 'nowebhookgate', ", { alertOn: webhookShouldAlert })", ')')
    await POST(new Request('https://x/api/stripe/webhook', { method: 'POST', headers: { 'stripe-signature': 'x' }, body: '{}' }))
    expect(sent()).toHaveLength(0)                              // real: 1
  })
  it('webhook with the signature exclusion removed alerts on a bad-signature 400 (so the exclusion test is real)', async () => {
    const { POST } = await mutate('app/api/stripe/webhook/route.ts', 'nosigexclusion', 'return !(status === 400 && SIGNATURE_400.has(detail))', 'return true')
    await POST(new Request('https://x/api/stripe/webhook', { method: 'POST', body: '{}' }))
    expect(sent()).toHaveLength(1)                              // real: 0
  })
})
