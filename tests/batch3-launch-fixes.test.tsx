// Batch 3 launch fixes (items 1–5, 7). Supabase is faked or run on in-memory
// Postgres (pglite) — no live data is touched.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { PGlite } from '@electric-sql/pglite'
import { makeFakeDb } from './helpers/fakeSupabase'

let db = makeFakeDb()
let user: any = { id: 'agent-1', user_metadata: { phone: '+15555550123' } }
const sent: string[] = []
let sendResult: any = { sent: true }

vi.mock('server-only', () => ({}))
vi.mock('../lib/supabase-admin', () => ({ createAdminSupabase: () => db.client }))
vi.mock('../lib/supabase-server', () => ({
  createServerSupabase: () => ({
    auth: { getUser: async () => ({ data: { user }, error: null }) },
    from: (t: string) => db.client.from(t),
  }),
}))
vi.mock('../lib/twilio', () => ({
  smsConfigured: () => true,
  sendSmsDetailed: async (_to: string, body: string) => { sent.push(body); return sendResult },
}))

const { PLAN_CONFIG } = await import('../lib/plans')
const { planChecklist, limitLabel } = await import('../lib/planChecklist')
const { planDisplayName } = await import('../lib/planLabel')
const { PRICING_CATALOG, FREE_TIER_DISPLAY, invitingAgentsCopy, INVITING_BADGE } = await import('../lib/pricing')
const { INVITE_ONLY_MESSAGE, REQUEST_INVITE_LABEL } = await import('../lib/inviteCopy')
const BrandedNotice = (await import('../components/BrandedNotice')).default
const notice = await import('../components/BrandedNotice')
const { GET: reportLinks } = await import('../app/api/properties/report-links/route')
const { POST: regenerate } = await import('../app/api/properties/[id]/regenerate-report-token/route')
const { POST: testSms } = await import('../app/api/test-sms/route')
const { TEST_SMS_DAILY_CAP } = await import('../lib/testSms')

const read = (p: string) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const code = (p: string) => read(p).split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')

function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    if (['node_modules', '.next', 'api'].includes(n) && dir === 'app' && n !== 'api') continue
    const p = join(dir, n)
    if (n === 'node_modules' || n === '.next') continue
    statSync(p).isDirectory() ? walk(p, out) : /\.(ts|tsx)$/.test(n) && out.push(p)
  }
  return out
}

// ── 1. Checklist wording ─────────────────────────────────────────────────────
describe('1. plan checklists match lib/plans.ts', () => {
  it('Starter says 3 listings / 15 signs, never "All your active"', () => {
    const labels = planChecklist('starter').items.map(i => i.label)
    expect(labels[0]).toBe('3 active listings')
    expect(labels[1]).toBe('15 active signs')
    expect(labels.join('|')).not.toContain('All your active')
    expect(PLAN_CONFIG.starter.maxActiveListings).toBe(3)
    expect(PLAN_CONFIG.starter.maxActiveSigns).toBe(15)
  })
  it.each(Object.keys(PLAN_CONFIG))('%s: limit lines equal the config; feature lines follow the flags', plan => {
    const cfg = PLAN_CONFIG[plan as keyof typeof PLAN_CONFIG]
    const c = planChecklist(plan)
    const labels = c.items.map(i => i.label)
    expect(labels[0]).toBe(limitLabel(cfg.maxActiveListings, 'listing'))
    expect(labels[1]).toBe(limitLabel(cfg.maxActiveSigns, 'sign'))
    const item = (l: string) => c.items.find(i => i.label === l)
    expect(item('Buyer interest scoring (Hot/Warm/Cold)')?.included ?? false).toBe(cfg.features.leadScoring)
    expect(item('SMS lead alerts')?.included ?? false).toBe(cfg.features.canUseSms)
    // "All your active …" only where the limit really is null
    expect(labels[0].startsWith('All your active')).toBe(cfg.maxActiveListings === null)
  })
  it('only founding/alpha keep the "Beta Agent Plan" heading', () => {
    expect(planChecklist('founding').heading).toBe('Your Beta Agent Plan')
    expect(planChecklist('alpha').heading).toBe('Your Beta Agent Plan')
    expect(planChecklist('starter').heading).toBe('Your Starter plan includes')
    expect(planChecklist('pro').heading).toBe('Your Pro plan includes')
    expect(planChecklist('trial').heading).toBe('Your Free Trial includes')
  })
  it('billing page no longer tells Starter/Pro they are in free beta', () => {
    const s = code('app/dashboard/billing/BillingPageClient.tsx')
    expect(s).toMatch(/plan === 'founding' \|\| plan === 'alpha'\s*\?[^]*?beta testing period/)
    expect(s).toContain("</strong> plan.</>")
  })
})

// ── 2. Settings badge ────────────────────────────────────────────────────────
describe('2. Settings badge shows the real plan name', () => {
  it.each([
    ['free', 'Free'], ['trial', 'Free Trial'], ['starter', 'Starter'], ['pro', 'Pro'],
    ['founding', 'Beta Agent'], ['alpha', 'Beta Agent'], [null, 'Free'], ['bogus', 'Free'],
  ])('%s → %s', (plan, name) => expect(planDisplayName(plan as any)).toBe(name))

  it('Starter/Pro names come from the pricing catalog', () => {
    expect(planDisplayName('starter')).toBe(PRICING_CATALOG.starter.displayName)
    expect(planDisplayName('pro')).toBe(PRICING_CATALOG.pro.displayName)
  })
  it('Settings page renders the shared name, not a hard-coded Free/Pro pair', () => {
    const s = code('app/dashboard/settings/page.tsx')
    expect(s).toContain('planBadgeText(rawPlan)')
    expect(s).not.toContain('Free Plan</>')
    expect(s).not.toContain("plan === 'pro' ? <>")
  })
})

// ── 3. Wording ───────────────────────────────────────────────────────────────
describe('3. beta wording gone; invite-only messaging', () => {
  const BAD = /private beta|limited spots|join beta|beta access|free beta|free private beta/i
  it('no customer-facing beta/limited-spots wording anywhere in app, components or lib', () => {
    const hits: string[] = []
    for (const dir of ['app', 'components', 'lib']) for (const f of walk(dir)) if (BAD.test(code(f))) hits.push(f)
    expect(hits).toEqual([])
  })
  it('exact new copy', () => {
    expect(INVITING_BADGE).toBe('Now inviting agents')
    expect(invitingAgentsCopy()).toBe('theQRealtor is now inviting agents. Start on the Free plan, or choose Starter ($39/mo) or Pro ($69/mo).')
    expect(REQUEST_INVITE_LABEL).toBe('Request an invite')
    expect(INVITE_ONLY_MESSAGE).toBe('theQRealtor is invite-only right now. Email hello@theqrealtor.com to request an invite.')
  })
  it('prices in the inviting line are read from lib/pricing.ts', () => {
    const line = invitingAgentsCopy()
    expect(line).toContain(PRICING_CATALOG.starter.displayPrice)
    expect(line).toContain(PRICING_CATALOG.pro.displayPrice)
    expect(line).toContain(FREE_TIER_DISPLAY.displayName)
  })
  it('marketing page: every signup button uses the new label and points at the signup tab', () => {
    const s = code('app/(marketing)/page.tsx')
    expect(s).not.toMatch(/\$\d/)
    const links = s.match(/<Link[^>]*href="\/auth\?tab=signup"[^>]*>\s*\{REQUEST_INVITE_LABEL\}/g) ?? []
    expect(links.length).toBe(5)
    expect(s.match(/REQUEST_INVITE_LABEL/g)!.length).toBe(links.length + 1) // + the import
  })
  it('blocked signup shows the invite-only message (client and API)', () => {
    expect(code('app/auth/page.tsx')).toContain('{INVITE_ONLY_MESSAGE}')
    const api = code('app/api/auth/beta-signup/route.ts')
    expect(api.match(/INVITE_ONLY_MESSAGE/g)!.length).toBeGreaterThanOrEqual(3)
    expect(api).not.toContain('private beta')
    expect(code('lib/signup.ts')).toContain("process.env.OPEN_SIGNUP_ENABLED === 'true'")
  })
})

// ── 4. Branded unknown-sign page ─────────────────────────────────────────────
describe('4. unknown sign / property', () => {
  const html = renderToStaticMarkup(createElement(BrandedNotice, { title: notice.SIGN_INACTIVE_TITLE }, notice.SIGN_INACTIVE_BODY))
  it("renders logo wordmark + \"This sign isn't active right now\", no error wording", () => {
    expect(html).toContain('>qr<')
    expect(html).toContain("This sign isn&#x27;t active right now")
    expect(html.toLowerCase()).not.toMatch(/not found|error|404|invalid/)
  })
  it('/p, /open-house and the global 404 use it; "Property not found" is gone', () => {
    for (const f of ['app/p/[propertyId]/page.tsx', 'app/open-house/[propertyId]/page.tsx']) {
      const s = code(f)
      expect(s).toContain('<BrandedNotice title={SIGN_INACTIVE_TITLE}>')
      expect(s).not.toContain('Property not found</')
      expect(s).toContain('finally {') // lookup failure can't leave the page crashed / loading
    }
    expect(code('app/not-found.tsx')).toContain('BrandedNotice')
  })
  it('wrong report token page is friendly too', () => {
    expect(code('app/report/[token]/page.tsx')).toContain('REPORT_UNAVAILABLE_TITLE')
    expect(notice.REPORT_UNAVAILABLE_TITLE.toLowerCase()).not.toMatch(/error|not found/)
  })
})

// ── 5. report_token access ───────────────────────────────────────────────────
const MIGRATION = read('supabase/migrations/070_hide_report_token.sql')
const TOKEN_A = '11111111-1111-1111-1111-111111111111'

async function makeDb(migration: string | null) {
  const pg = new PGlite()
  await pg.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create table public.properties (
      id uuid primary key, address text, agent_name text, created_at timestamptz default now(),
      user_id uuid, active boolean, city text, state text, price numeric, beds int, baths numeric,
      description text, agent_phone text, deleted_at timestamptz,
      report_token uuid not null default gen_random_uuid(),
      deactivated_at timestamptz, plan_locked_at timestamptz);
    alter table public.properties enable row level security;
    create policy "public read active" on public.properties for select to anon, authenticated using (active = true);
    grant usage on schema public to anon, authenticated, service_role;
    grant all on public.properties to anon, authenticated, service_role;
    insert into public.properties (id, address, active, report_token) values
      ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '1 Main', true, '${TOKEN_A}'),
      ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '2 Oak', false, '22222222-2222-2222-2222-222222222222');
  `)
  if (migration) await pg.exec(migration)
  return pg
}
async function asRole(pg: PGlite, role: string, sql: string): Promise<{ rows?: any[]; err?: string }> {
  await pg.exec(`set role ${role}`)
  try { return { rows: (await pg.query(sql)).rows as any[] } }
  catch (e: any) { return { err: String(e.message) } }
  finally { await pg.exec('reset role') }
}
/** True if the token can be learned by `role` in any of the ways a client would try. */
async function leaks(pg: PGlite, role: string) {
  const probes = [
    'select report_token from public.properties',
    'select * from public.properties',
    `select id from public.properties where report_token = '${TOKEN_A}'`,
    'select id, report_token::text as t from public.properties order by 2',
  ]
  for (const q of probes) if ((await asRole(pg, role, q)).rows) return true
  return false
}

describe('5. seller report token is not publicly readable', () => {
  it('BEFORE the migration the leak is real (control — proves the probes work)', async () => {
    const pg = await makeDb(null)
    expect(await leaks(pg, 'anon')).toBe(true)
    expect(await leaks(pg, 'authenticated')).toBe(true)
  })

  it('AFTER the migration anon and authenticated cannot list, filter on or select report_token', async () => {
    const pg = await makeDb(MIGRATION)
    for (const role of ['anon', 'authenticated']) {
      expect(await leaks(pg, role)).toBe(false)
      const r = await asRole(pg, role, 'select report_token from public.properties')
      expect(r.err).toMatch(/permission denied/i)
    }
  })

  it('everything else the buyer pages read still works, and RLS still hides inactive rows', async () => {
    const pg = await makeDb(MIGRATION)
    for (const role of ['anon', 'authenticated']) {
      const r = await asRole(pg, role, 'select id, address, city, state, price, beds, baths, description, agent_name, agent_phone, deleted_at, plan_locked_at from public.properties')
      expect(r.err).toBeUndefined()
      expect(r.rows!.map(x => x.address)).toEqual(['1 Main'])
    }
  })

  it('the server (service role) can still resolve a correct token and a wrong token finds nothing', async () => {
    const pg = await makeDb(MIGRATION)
    const ok = await asRole(pg, 'service_role', `select id from public.properties where report_token = '${TOKEN_A}'`)
    expect(ok.rows).toHaveLength(1)
    const bad = await asRole(pg, 'service_role', `select id from public.properties where report_token = '33333333-3333-3333-3333-333333333333'`)
    expect(bad.rows).toHaveLength(0)
  })

  it('is a privileges-only migration (changes no rows)', () => {
    expect(MIGRATION).not.toMatch(/^\s*(insert|update|delete|alter table)\b/im)
  })

  // MUTATION CHECK — each deliberate weakening of the rule must be caught.
  describe('mutation check: weakened migrations are detected as leaking', () => {
    const mutants: Record<string, string> = {
      'drops the table-wide revoke': MIGRATION.replace('revoke select on public.properties from anon, authenticated;', ''),
      'grants report_token back in the column list (and drops the final revoke)': MIGRATION
        .replace('beds, baths, description', 'beds, baths, report_token, description')
        .replace('revoke select (report_token) on public.properties from anon, authenticated;', ''),
      'forgets authenticated': MIGRATION.replace(/revoke select on public\.properties from anon, authenticated;/, 'revoke select on public.properties from anon;')
        .replace('to anon, authenticated;\n\n-- Belt', 'to anon;\n\n-- Belt').replace(/revoke select \(report_token\) on public\.properties from anon, authenticated;/, 'revoke select (report_token) on public.properties from anon;'),
      'is a no-op file': '-- nothing',
    }
    it.each(Object.keys(mutants))('mutant: %s', async name => {
      expect(mutants[name]).not.toBe(MIGRATION)
      const pg = await makeDb(mutants[name])
      const anyLeak = (await leaks(pg, 'anon')) || (await leaks(pg, 'authenticated'))
      expect(anyLeak).toBe(true)
    })
  })

  describe('server-side lookups for the agent dashboard', () => {
    beforeEach(() => {
      db = makeFakeDb()
      user = { id: 'agent-1', user_metadata: {} }
      db.tables.properties = [
        { id: 'p1', user_id: 'agent-1', report_token: 'tok-1' },
        { id: 'p2', user_id: 'agent-1', report_token: 'tok-2' },
        { id: 'p3', user_id: 'someone-else', report_token: 'tok-3' },
      ]
    })
    it('report-links returns only the signed-in agent\'s own tokens', async () => {
      const res = await reportLinks()
      expect(await res.json()).toEqual({ links: { p1: 'tok-1', p2: 'tok-2' } })
    })
    it('report-links refuses a signed-out caller', async () => {
      user = null
      expect((await reportLinks()).status).toBe(401)
    })
    it('regenerate rotates an owned property and returns the new token; not-owned is 404', async () => {
      const ok = await regenerate(new Request('http://x', { method: 'POST' }), { params: { id: 'p1' } })
      const body = await ok.json()
      expect(ok.status).toBe(200)
      expect(body.report_token).toMatch(/^[0-9a-f-]{36}$/)
      expect(db.tables.properties.find(p => p.id === 'p1')!.report_token).toBe(body.report_token)
      const other = await regenerate(new Request('http://x', { method: 'POST' }), { params: { id: 'p3' } })
      expect(other.status).toBe(404)
      expect(db.tables.properties.find(p => p.id === 'p3')!.report_token).toBe('tok-3')
    })
  })

  it('no browser code selects report_token or * from properties', () => {
    const offenders: string[] = []
    for (const f of [...walk('app'), ...walk('components')].filter(f => !f.startsWith('app/api'))) {
      const s = read(f)
      for (const m of s.matchAll(/from\('properties'\)\s*\.select\(\s*(['"`])([^'"`]*)\1/g)) {
        if (/report_token|\*/.test(m[2])) offenders.push(`${f}: ${m[2]}`)
      }
    }
    expect(offenders).toEqual([])
  })
})

// ── 7. test-sms ──────────────────────────────────────────────────────────────
describe('7. test-sms route', () => {
  beforeEach(() => {
    db = makeFakeDb()
    user = { id: 'agent-1', user_metadata: { phone: '+15555550123' } }
    sent.length = 0
    sendResult = { sent: true }
    db.tables.sms_send_log = []
  })
  it('message ends with "Reply STOP to opt out."', async () => {
    const res = await testSms()
    expect(res.status).toBe(200)
    expect(sent).toHaveLength(1)
    expect(sent[0].endsWith('Reply STOP to opt out.')).toBe(true)
  })
  it(`allows ${TEST_SMS_DAILY_CAP} per agent per day, then 429 without sending`, async () => {
    for (let i = 0; i < TEST_SMS_DAILY_CAP; i++) expect((await testSms()).status).toBe(200)
    const res = await testSms()
    expect(res.status).toBe(429)
    expect(sent).toHaveLength(TEST_SMS_DAILY_CAP)
  })
  it('another agent is not affected, and yesterday does not count', async () => {
    for (let i = 0; i < TEST_SMS_DAILY_CAP; i++) await testSms()
    user = { id: 'agent-2', user_metadata: { phone: '+15555550999' } }
    expect((await testSms()).status).toBe(200)
    db.tables.sms_send_log = db.tables.sms_send_log.map(r => ({ ...r, created_at: new Date(Date.now() - 2 * 86_400_000).toISOString() }))
    user = { id: 'agent-1', user_metadata: { phone: '+15555550123' } }
    expect((await testSms()).status).toBe(200)
  })
  it('real alert rows (other alert types) do not use up the test cap', async () => {
    for (let i = 0; i < 20; i++) db.tables.sms_send_log.push({ agent_id: 'agent-1', alert_type: 'showing', created_at: new Date().toISOString() })
    expect((await testSms()).status).toBe(200)
  })
  it('fails closed when the cap cannot be read', async () => {
    db.failReads.add('sms_send_log')
    const res = await testSms()
    expect(res.status).toBe(503)
    expect(sent).toHaveLength(0)
  })
})
