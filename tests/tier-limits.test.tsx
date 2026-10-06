// Final tier limits, Pro display price, sidebar usage meters, and the closed
// client-side plan write. Supabase is mocked — no live data is touched.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { makeFakeDb } from './helpers/fakeSupabase'

let db = makeFakeDb()
let user: { id: string } | null = { id: 'agent-1' }
const AGENT = 'agent-1'

vi.mock('../lib/supabase-admin', () => ({ createAdminSupabase: () => db.client }))
vi.mock('../lib/supabase-server', () => ({
  createServerSupabase: () => ({
    auth: { getUser: async () => ({ data: { user }, error: null }) },
    from: (t: string) => db.client.from(t),
  }),
}))

const { PLAN_CONFIG, planConfig } = await import('../lib/plans')
const { PRICING_CATALOG, pricingTierConfig } = await import('../lib/pricing')
const { planUsageMeters, SEGMENTED_METER_MAX } = await import('../lib/planUsage')
const { POST: createProperty } = await import('../app/api/properties/route')
const { POST: createSign } = await import('../app/api/signs/create/route')
const { getTrialStatus, TRIAL_DAYS } = await import('../lib/trial')

const DAY = 86_400_000
const daysAgo = (n: number) => new Date(Date.now() - n * DAY).toISOString()

function seedAgent(plan: string, betaJoinedAt: string | null = daysAgo(1)) {
  db = makeFakeDb()
  db.tables.profiles = [{ id: AGENT, plan, beta_joined_at: betaJoinedAt }]
  db.tables.properties = []
  db.tables.signs = []
}
const addListings = (n: number, extra: Record<string, unknown> = {}) => {
  for (let i = 0; i < n; i++) db.tables.properties.push({ id: `p${db.tables.properties.length}`, user_id: AGENT, active: true, deleted_at: null, ...extra })
}
const addSigns = (n: number, extra: Record<string, unknown> = {}) => {
  for (let i = 0; i < n; i++) db.tables.signs.push({ id: `s${db.tables.signs.length}`, agent_id: AGENT, label: 'x', archived_at: null, ...extra })
}

const postListing = () => createProperty(new Request('https://x/api/properties', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ address: '1 Test St' }),
}))
let ip = 0
const postSign = () => createSign(new Request('https://x/api/signs/create', {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.9.${Math.floor(++ip / 200)}.${ip % 200}` },
  body: JSON.stringify({ label: 'Yard sign' }),
}))

beforeEach(() => {
  user = { id: AGENT }
  for (const k of ['log', 'warn', 'error'] as const) vi.spyOn(console, k).mockImplementation(() => {})
})

// ── Part 1: limits ───────────────────────────────────────────────────────────
describe('lib/plans.ts — final limits', () => {
  it.each([
    ['trial',   3,    15],
    ['free',    1,    3],
    ['starter', 3,    15],
    ['pro',     null, 50],
    ['founding', null, 10],
    ['alpha',   null, 10],
  ] as const)('%s: listings %s, signs %s', (plan, listings, signs) => {
    expect(PLAN_CONFIG[plan].maxActiveListings).toBe(listings)
    expect(PLAN_CONFIG[plan].maxActiveSigns).toBe(signs)
  })

  it('only trial is subject to the 45-day clock', () => {
    expect(Object.entries(PLAN_CONFIG).filter(([, c]) => c.subjectToTrialExpiry).map(([k]) => k)).toEqual(['trial'])
    expect(TRIAL_DAYS).toBe(45)
  })

  it('unknown plan strings still fall back to free', () => {
    expect(planConfig('typo')).toBe(PLAN_CONFIG.free)
  })
})

describe('server-side listing limit (app/api/properties)', () => {
  it.each([['trial', 3], ['free', 1], ['starter', 3]] as const)('%s: allowed at %s-1, blocked at %s', async (plan, limit) => {
    seedAgent(plan)
    addListings(limit - 1)
    expect((await postListing()).status).toBe(200)          // brings it to exactly the limit
    const blocked = await postListing()
    expect(blocked.status).toBe(403)
    expect(await blocked.json()).toMatchObject({ limitReached: true, limit })
  })

  it('pro has no listing cap', async () => {
    seedAgent('pro')
    addListings(40)
    expect((await postListing()).status).toBe(200)
  })

  it('offline and archived listings do not count toward the limit', async () => {
    seedAgent('starter')
    addListings(2)
    addListings(5, { active: false })
    addListings(5, { deleted_at: daysAgo(3) })
    expect((await postListing()).status).toBe(200)
  })
})

describe('server-side sign limit (app/api/signs/create)', () => {
  it.each([['trial', 15], ['free', 3], ['starter', 15], ['pro', 50]] as const)('%s: allowed up to %s, blocked after', async (plan, limit) => {
    seedAgent(plan)
    addSigns(limit - 1)
    expect((await postSign()).status).toBe(200)
    const blocked = await postSign()
    expect(blocked.status).toBe(403)
    expect(await blocked.json()).toMatchObject({ limitReached: true, limit })
  })

  it('archived signs do not count', async () => {
    seedAgent('free')
    addSigns(2)
    addSigns(10, { archived_at: daysAgo(2) })
    expect((await postSign()).status).toBe(200)
  })
})

describe('trial expiry (unchanged)', () => {
  it('a trial still expires after 45 days', () => {
    expect(getTrialStatus(daysAgo(44), 'trial').expired).toBe(false)
    expect(getTrialStatus(daysAgo(46), 'trial').expired).toBe(true)
  })

  it('an expired trial is blocked from new listings even under the cap', async () => {
    seedAgent('trial', daysAgo(46))
    const res = await postListing()
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ betaExpired: true })
  })

  it('an unexpired trial can still create listings', async () => {
    seedAgent('trial', daysAgo(10))
    expect((await postListing()).status).toBe(200)
  })
})

// ── Part 2: display prices and copy ─────────────────────────────────────────
describe('lib/pricing.ts — display', () => {
  it('Starter $39, Pro $69', () => {
    expect(pricingTierConfig('starter').displayPrice).toBe('$39/mo')
    expect(pricingTierConfig('pro').displayPrice).toBe('$69/mo')
  })

  it('tier copy is built from the enforced limits', () => {
    expect(pricingTierConfig('starter').copy).toBe('Up to 3 active listings and 15 active signs.')
    expect(pricingTierConfig('pro').copy).toBe('All your active listings, up to 50 active signs.')
  })

  it('catalog limits mirror lib/plans.ts', () => {
    expect(PRICING_CATALOG.starter.maxActiveSigns).toBe(15)
    expect(PRICING_CATALOG.pro.maxActiveSigns).toBe(50)
    expect(PRICING_CATALOG.pro.maxActiveListings).toBeNull()
  })
})

describe('marketing page renders the new prices and limits', () => {
  it('shows $39 / $69, 15 / 50 signs, "All your active listings"; no $79, no "unlimited"', async () => {
    const { default: MarketingPage } = await import('../app/(marketing)/page')
    const html = renderToStaticMarkup(createElement(MarketingPage))
    expect(html).toContain('$39')
    expect(html).toContain('$69')
    expect(html).toContain('15 active signs')
    expect(html).toContain('50 active signs')
    expect(html).toContain('All your active listings')
    expect(html).not.toContain('$79')
    expect(html.toLowerCase()).not.toContain('unlimited')
    // FinalCta reads the trial limits too
    expect(html).toContain('3 listings')
    expect(html).toContain('15 QR codes')
  })
})

describe('billing page reads prices from the catalog (no hardcoded values)', () => {
  // Line comments stripped — the file's own comments mention "Unlimited" to
  // explain why the copy avoids it; only real strings count here.
  const src = readFileSync(new URL('../app/dashboard/billing/BillingPageClient.tsx', import.meta.url), 'utf8')
    .split('\n').map(l => l.replace(/^\s*\/\/.*$/, '')).join('\n')
  it('tier cards print cfg.displayPrice and cfg.copy', () => {
    expect(src).toContain('{cfg.displayPrice}')
    expect(src).toContain('{cfg.copy}')
  })
  it('no literal $79 / $69 / $39 and no "Unlimited" copy', () => {
    expect(src).not.toMatch(/\$(79|69|39)\b/)
    expect(src).not.toMatch(/['"`][^'"`]*Unlimited[^'"`]*['"`]/)
    expect(src).toContain("'All your active listings'")
  })
})

// ── Part 3: sidebar meters ──────────────────────────────────────────────────
describe('planUsageMeters', () => {
  it.each([
    ['trial',   [['listings', 3], ['signs', 15]]],
    ['free',    [['listings', 1], ['signs', 3]]],
    ['starter', [['listings', 3], ['signs', 15]]],
    ['pro',     [['signs', 50]]],
    ['founding', [['signs', 10]]],
  ] as const)('%s', (plan, expected) => {
    expect(planUsageMeters(plan, 2, 4).map(m => [m.key, m.limit])).toEqual(expected)
  })

  it('carries the used counts through', () => {
    expect(planUsageMeters('starter', 2, 7)).toEqual([
      { key: 'listings', label: 'Listings used', used: 2, limit: 3 },
      { key: 'signs', label: 'QR/Signs used', used: 7, limit: 15 },
    ])
  })

  it('50-sign meter switches to a continuous bar (segments would be slivers)', () => {
    expect(50).toBeGreaterThan(SEGMENTED_METER_MAX)
    expect(15).toBeLessThanOrEqual(SEGMENTED_METER_MAX)
  })

  it('DashboardLayout has no hardcoded free limit and uses the shared helper', () => {
    const src = readFileSync(new URL('../components/DashboardLayout.tsx', import.meta.url), 'utf8')
    expect(src).not.toMatch(/limit:\s*1\b/)
    expect(src).toContain('planUsageMeters(plan, activeListingCount, signCount)')
  })
})

// ── Part 4: no client code writes profiles.plan ─────────────────────────────
describe('no browser code writes profiles.plan', () => {
  function walk(dir: string): string[] {
    return readdirSync(dir).flatMap(f => {
      const p = join(dir, f)
      if (statSync(p).isDirectory()) return f === 'node_modules' ? [] : walk(p)
      return /\.(tsx?|jsx?)$/.test(f) ? [p] : []
    })
  }
  it('no "use client" file updates or upserts a plan value', () => {
    const root = new URL('..', import.meta.url).pathname
    const offenders = [...walk(join(root, 'app')), ...walk(join(root, 'components'))]
      .filter(f => /^['"]use client['"]/m.test(readFileSync(f, 'utf8')))
      .filter(f => /\.(update|upsert)\(\s*\{[^}]*\bplan\s*:/.test(readFileSync(f, 'utf8')))
    expect(offenders).toEqual([])
  })

  it('the Stripe self-heal is gone from DashboardLayout', () => {
    const src = readFileSync(new URL('../components/DashboardLayout.tsx', import.meta.url), 'utf8')
    expect(src).not.toContain("update({ plan: 'pro' })")
    expect(src).not.toContain('/api/stripe/subscription')
  })
})
