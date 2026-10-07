// Wording + layout fixes: paused buyer message with agent name, "Recommended"
// gated on real activity, Signs page notice reordered below the sticky
// header, and a specific duplicate-phone signup message. No database or
// migration changes in this task; Supabase/Twilio are mocked.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'fs'
import { makeFakeDb } from './helpers/fakeSupabase'

let db = makeFakeDb()

const defaultAuthAdmin = {
  createUser: async () => ({ data: { user: { id: 'new-user-1' } }, error: null }),
  deleteUser: async () => ({ data: null, error: null }),
}
vi.mock('@supabase/supabase-js', () => ({
  // db.client.auth, when a test sets it, overrides the default stub below —
  // e.g. to spy on deleteUser for the rollback check.
  createClient: () => ({ ...db.client, auth: db.client.auth ?? { admin: defaultAuthAdmin } }),
}))
vi.mock('../lib/supabase-admin', () => ({ createAdminSupabase: () => db.client }))
vi.mock('../lib/supabase-server', () => ({
  createServerSupabase: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'agent-1' } }, error: null }) },
    from: (t: string) => db.client.from(t),
  }),
}))
vi.mock('../lib/phoneVerifyToken', () => ({ verifyPhoneVerifyToken: () => true }))
vi.mock('../lib/signup', () => ({ openSignupEnabled: () => false, MAX_ENROLLED_AGENTS: 999 }))

const create = vi.fn()
vi.mock('twilio', () => ({ default: vi.fn(() => ({ messages: { create } })) }))

const { requestsPausedCopy } = await import('../lib/planLock')
const { hasRecentActivity } = await import('../components/FreeSelection')
const { POST: listingAvailability } = await import('../app/api/listing-availability/route')
const { POST: betaSignup } = await import('../app/api/auth/beta-signup/route')

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const P1 = '11111111-1111-4111-8111-111111111111'

beforeEach(() => {
  db = makeFakeDb()
  create.mockReset()
  for (const k of ['log', 'warn', 'error'] as const) vi.spyOn(console, k).mockImplementation(() => {})
})

// ── 1. Paused buyer message ──────────────────────────────────────────────────
describe('paused buyer message names the agent', () => {
  it('exact wording with a name, and the "the listing agent" fallback', () => {
    expect(requestsPausedCopy('Jane Smith')).toBe(
      "This listing isn't taking requests through this page right now. Please contact Jane Smith using the contact details on the sign.")
    expect(requestsPausedCopy(null)).toBe(
      "This listing isn't taking requests through this page right now. Please contact the listing agent using the contact details on the sign.")
  })

  it('listing-availability: agentName present only when paused, and never phone/email/plan/trial', async () => {
    db.tables.properties = [{ id: P1, user_id: 'agent-1', plan_locked_at: '2026-01-01T00:00:00Z', agent_name: 'Jane Smith', agent_phone: '+15551234567' }]
    const res = await listingAvailability(new Request('https://x/api/listing-availability', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ propertyId: P1 }),
    }))
    const text = await res.text()
    expect(JSON.parse(text)).toEqual({ acceptingRequests: false, agentName: 'Jane Smith' })
    expect(text).not.toMatch(/\+1555|phone|email|plan|trial/i)
  })

  it('listing-availability: no agent_name on the listing → agentName is null, not omitted or the phone', async () => {
    db.tables.properties = [{ id: P1, user_id: 'agent-1', plan_locked_at: '2026-01-01T00:00:00Z', agent_name: null, agent_phone: '+15551234567' }]
    const res = await listingAvailability(new Request('https://x/api/listing-availability', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ propertyId: P1 }),
    }))
    expect(await res.json()).toEqual({ acceptingRequests: false, agentName: null })
  })

  it('listing-availability: accepting → no agentName key at all', async () => {
    db.tables.properties = [{ id: P1, user_id: 'agent-1', plan_locked_at: null, agent_name: 'Jane Smith' }]
    db.tables.profiles = [{ id: 'agent-1', plan: 'pro', beta_joined_at: '2020-01-01T00:00:00Z' }]
    const res = await listingAvailability(new Request('https://x/api/listing-availability', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ propertyId: P1 }),
    }))
    const body = await res.json()
    expect(body).toEqual({ acceptingRequests: true })
    expect('agentName' in body).toBe(false)
  })

  it('/p and /open-house carry agentName from availability into RequestsPausedNotice', () => {
    for (const p of ['app/p/[propertyId]/page.tsx', 'app/open-house/[propertyId]/page.tsx']) {
      const s = src(p)
      expect(s).toContain('setPausedAgentName(availability?.agentName ?? null)')
      expect(s).toContain('<RequestsPausedNotice border={C.border} color={C.muted} agentName={pausedAgentName} />')
    }
  })

  it('submit-lead and open-house-checkin build the message from the listing they already fetched', () => {
    const submitLead = src('app/api/submit-lead/route.ts')
    expect(submitLead).toContain('requestsPausedCopy(property.agent_name as string | null)')
    const checkin = src('app/api/open-house-checkin/route.ts')
    expect(checkin).toContain('requestsPausedCopy(property.agent_name as string | null)')
    expect(checkin).toContain("select('id, address, user_id, active, agent_name')")
  })
})

// ── 2. "Recommended" tag gated on activity ───────────────────────────────────
describe('hasRecentActivity: Recommended tag only with real activity', () => {
  it.each([
    [{ scans30: 0, leads30: 0 }, false],
    [{ scans30: 1, leads30: 0 }, true],
    [{ scans30: 0, leads30: 1 }, true],
    [{ scans30: 3, leads30: 2 }, true],
  ] as const)('%j → %s', (stats, want) => {
    expect(hasRecentActivity(stats)).toBe(want)
  })

  it('FreeSelection gates both tags on it, without changing the pre-selection logic', () => {
    const s = src('components/FreeSelection.tsx')
    expect(s).toContain('rankedListings[0] && hasRecentActivity(rankedListings[0]) ? rankedListings[0].id : null')
    expect(s).toContain('onListing.slice(0, FREE_MAX_SIGNS).filter(hasRecentActivity).map(s => s.id)')
    // Pre-selection (top N by rank) is untouched by the activity filter
    expect(s).toContain('setSignIds(eligibleSigns(o.signs, top).onListing.slice(0, FREE_MAX_SIGNS).map(s => s.id))')
  })
})

// ── 3. Signs page notice layout ──────────────────────────────────────────────
describe('Signs page notice renders before the other banners, right after the header', () => {
  it('no element can land above it inside the padded content area', () => {
    const s = src('app/dashboard/signs/page.tsx')
    const padded = s.indexOf("<div style={{ padding: '24px 28px' }}>")
    const notice = s.indexOf('Some signs aren&apos;t taking buyer requests')
    const pageErrorBanner = s.indexOf('{pageError && (')
    const autoAssign = s.indexOf('{autoAssignNotice && (')
    expect(padded).toBeGreaterThan(-1)
    expect(notice).toBeGreaterThan(padded)
    expect(pageErrorBanner).toBeGreaterThan(notice)
    expect(autoAssign).toBeGreaterThan(notice)
    // Nothing but the padded container's own opening tag precedes it
    expect(s.slice(padded, notice)).not.toMatch(/background: '#1C0A0A'|background: '#062014'/)
  })
})

// ── 4. Signup duplicate-phone message ────────────────────────────────────────
describe('signup duplicate-phone message', () => {
  // lib/signup is mocked with openSignupEnabled: () => false, so Gate 1
  // (invitation) still runs — give it an approved row so these tests reach
  // the phone check, same as any other invited signup.
  beforeEach(() => {
    db.tables.beta_allowlist = [{ email: 'agent@example.com', approved: true }]
  })

  function signupBody(overrides: Record<string, unknown> = {}) {
    return JSON.stringify({
      name: 'Test Agent', email: 'agent@example.com', password: 'longenough',
      phone: '3105550142', phoneVerifyToken: 'anything', ...overrides,
    })
  }
  const signup = (body: string) => betaSignup(new Request('https://x/api/auth/beta-signup', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body,
  }))

  it('pre-check collision: specific message', async () => {
    db.tables.profiles = [{ id: 'existing', phone: '+13105550142' }]
    const res = await signup(signupBody())
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('This phone number is already linked to an account. Try signing in instead.')
  })

  it('race-condition collision (23505 on the profile write): same specific message, and the half-created auth user is rolled back', async () => {
    // Pre-check passes (no existing row with this phone yet) — the race is
    // another signup landing between the pre-check and this write, which the
    // fake simulates by failing just the one profiles write.
    db.failWrites.set('profiles', { code: '23505', message: 'duplicate key value violates unique constraint "profiles_phone_unique_idx"' })
    const deleteUser = vi.fn(async () => ({ data: null, error: null }))
    db.client.auth = { admin: {
      createUser: async () => ({ data: { user: { id: 'new-user-1' } }, error: null }),
      deleteUser,
    } }
    const res = await signup(signupBody())
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('This phone number is already linked to an account. Try signing in instead.')
    expect(deleteUser).toHaveBeenCalledWith('new-user-1')
  })

  it('both duplicate-phone paths return the identical specific message (source check)', () => {
    const s = src('app/api/auth/beta-signup/route.ts')
    expect(s.match(/error: DUPLICATE_PHONE_ERROR/g)).toHaveLength(2)
    expect(s).toContain("const DUPLICATE_PHONE_ERROR =\n  'This phone number is already linked to an account. Try signing in instead.'")
    expect(s).not.toContain('GENERIC_SIGNUP_ERROR')
  })

  it('other failures keep their own message, not the duplicate-phone one', async () => {
    const res = await signup(signupBody({ password: 'short' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Password must be at least 6 characters.')
  })

  it('a valid phone (no collision) proceeds past the duplicate-phone check', async () => {
    const res = await signup(signupBody())
    expect(res.status).not.toBe(400)
  })

  it('the signup page shows body.error as-is (no special-casing needed for the new message)', () => {
    const s = src('app/auth/page.tsx')
    expect(s).toContain('setMessage(body.error ?? ')
    expect(s).toContain('if (res.status === 400) {')
  })
})
