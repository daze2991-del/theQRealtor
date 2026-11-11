// Migration 067 (downgrade auto-fit), run for real in an in-memory Postgres
// (tests/helpers/planDb.ts) together with 059–063, from the migration files.

import { beforeEach, describe, expect, it } from 'vitest'
import { makePlanDb } from './helpers/planDb'
import { PLAN_CONFIG } from '../lib/plans'

let t: Awaited<ReturnType<typeof makePlanDb>>

beforeEach(async () => {
  t = await makePlanDb()
})

describe('plan_limits() parity with lib/plans.ts (run in SQL)', () => {
  it.each([...Object.keys(PLAN_CONFIG), 'bogus', null])('%s', async plan => {
    const row = await t.one(`select max_listings, max_signs from public.plan_limits($1)`, [plan])
    const cfg = PLAN_CONFIG[(plan && plan in PLAN_CONFIG ? plan : 'free') as keyof typeof PLAN_CONFIG]
    expect(row).toEqual({ max_listings: cfg.maxActiveListings, max_signs: cfg.maxActiveSigns })
  })
})

describe('downgrades fit the agent to the new limits', () => {
  it('Pro → Starter keeps the 3 most active listings and 15 signs, and sets the flag', async () => {
    const a = await t.agent('pro')
    const L = [] as string[]
    for (const scans of [5, 1, 9, 0, 3]) L.push(await t.listing(a, { scans }))
    for (let i = 0; i < 20; i++) await t.sign(a)
    await t.setPlan(a, 'starter')

    const s = await t.state(a)
    expect(s.plan).toBe('starter')
    expect(new Set(s.unlockedListings)).toEqual(new Set([L[2], L[0], L[4]])) // 9, 5, 3 scans
    expect(s.unlockedSigns).toHaveLength(15)
    expect(s.lockedSigns).toHaveLength(5)
    expect(s.plan_choice_required_at).toBeTruthy()
    expect(s.totalListings).toBe(5)   // nothing deleted
    expect(s.totalSigns).toBe(20)
  })

  it('Starter → Free keeps 1 listing and 3 signs; signs on locked listings are locked first', async () => {
    const a = await t.agent('starter')
    // Sign scans also count toward the sign's listing (scan_events carries both ids).
    const top = await t.listing(a, { scans: 200 })
    const other = await t.listing(a, { scans: 2 })
    const onOther1 = await t.sign(a, { listing: other, scans: 50 }) // busy, but its listing gets locked
    const onOther2 = await t.sign(a, { listing: other, scans: 40 })
    const onTop = await t.sign(a, { listing: top, scans: 1 })
    const loose1 = await t.sign(a)
    const loose2 = await t.sign(a)
    await t.setPlan(a, 'free')

    const s = await t.state(a)
    expect(s.unlockedListings).toEqual([top])
    expect(new Set(s.unlockedSigns)).toEqual(new Set([onTop, loose1, loose2]))
    expect(new Set(s.lockedSigns)).toEqual(new Set([onOther1, onOther2]))
    expect(s.plan_choice_required_at).toBeTruthy()
  })

  it('a signs-only overage locks only signs', async () => {
    const a = await t.agent('starter')
    const l = await t.listing(a)
    for (let i = 0; i < 5; i++) await t.sign(a, { listing: l, scans: i })
    await t.setPlan(a, 'free')

    const s = await t.state(a)
    expect(s.unlockedListings).toEqual([l])
    expect(s.lockedListings).toEqual([])
    expect(s.unlockedSigns).toHaveLength(3)
    expect(s.lockedSigns).toHaveLength(2)
  })

  it('a downgrade that is already within the new limits locks nothing and sets no flag', async () => {
    const a = await t.agent('pro')
    await t.listing(a); await t.listing(a)
    for (let i = 0; i < 4; i++) await t.sign(a)
    await t.setPlan(a, 'starter')
    const s = await t.state(a)
    expect(s.lockedListings).toEqual([])
    expect(s.lockedSigns).toEqual([])
    expect(s.plan_choice_required_at).toBeNull()
  })

  it('offline and deleted listings and archived signs are never touched', async () => {
    const a = await t.agent('starter')
    await t.listing(a); const offline = await t.listing(a, { active: false })
    await t.db.query(`update public.properties set deleted_at = now() where id = $1`, [await t.listing(a)])
    const archived = await t.sign(a)
    await t.db.query(`update public.signs set archived_at = now() where id = $1`, [archived])
    await t.setPlan(a, 'free')
    const s = await t.state(a)
    expect(s.lockedListings).toEqual([])
    expect(s.unlockedListings).toContain(offline)
    expect(s.unlockedSigns).toContain(archived)
  })
})

describe('the trigger leaves these alone', () => {
  const crowd = async (plan: string | null) => {
    const a = await t.agent(plan)
    for (let i = 0; i < 4; i++) await t.listing(a, { scans: i })
    for (let i = 0; i < 6; i++) await t.sign(a)
    return a
  }

  it.each([
    ['alpha', 'free'], ['founding', 'free'], ['alpha', 'starter'], ['founding', 'trial'],
    ['free', 'alpha'], ['starter', 'founding'],
  ])('founding/alpha are exempt in both directions: %s → %s', async (from, to) => {
    const a = await crowd(from)
    await t.setPlan(a, to)
    const s = await t.state(a)
    expect(s.lockedListings).toEqual([])
    expect(s.lockedSigns).toEqual([])
    expect(s.plan_choice_required_at).toBeNull()
  })

  it('auto_fit_plan_limits itself is a no-op for founding/alpha', async () => {
    const a = await crowd('alpha')
    expect(await t.one(`select public.auto_fit_plan_limits($1) as r`, [a])).toEqual({
      r: { skipped: 'exempt', lockedListings: 0, lockedSigns: 0 },
    })
  })

  it.each([['free', 'starter'], ['starter', 'pro'], ['free', 'pro'], ['trial', 'starter'], ['starter', 'trial']])(
    'upgrades and equal-limit moves do not fit: %s → %s', async (from, to) => {
      const a = await crowd(from)
      await t.setPlan(a, to)
      const s = await t.state(a)
      expect(s.lockedListings).toEqual([])
      expect(s.lockedSigns).toEqual([])
      expect(s.plan_choice_required_at).toBeNull()
    })

  it('same-plan updates, NULL and unrecognized plan values do not fit', async () => {
    const a = await crowd('starter')
    await t.setPlan(a, 'starter')
    await t.setPlan(a, null)
    await t.setPlan(a, 'starter')
    await t.setPlan(a, 'stater') // typo
    const s = await t.state(a)
    expect(s.lockedListings).toEqual([])
    expect(s.lockedSigns).toEqual([])
    expect(s.plan_choice_required_at).toBeNull()
  })
})

describe('re-upgrade', () => {
  it('unlocks by recent activity up to the new limits (unchanged 060 behavior)', async () => {
    const a = await t.agent('starter')
    for (let i = 0; i < 3; i++) await t.listing(a, { scans: i })
    for (let i = 0; i < 5; i++) await t.sign(a)
    await t.setPlan(a, 'free')
    expect((await t.state(a)).lockedListings).toHaveLength(2)

    await t.setPlan(a, 'starter')
    const s = await t.state(a)
    expect(s.lockedListings).toEqual([])
    expect(s.lockedSigns).toEqual([])
  })
})

describe('trial → Free through apply_free_selection (existing end-of-trial chooser)', () => {
  it("the agent's choice wins over the trigger's auto-fit, and no flag is left behind", async () => {
    const a = await t.agent('trial', { beta_joined_at: new Date(Date.now() - 60 * 86_400_000).toISOString() })
    const busy = await t.listing(a, { scans: 20 })      // the trigger alone would keep this one
    const chosen = await t.listing(a, { scans: 1 })
    const busySign = await t.sign(a, { listing: busy, scans: 30 })
    const chosenSign = await t.sign(a, { listing: chosen })

    const r = await t.one(`select public.apply_free_selection($1, 'choose', $2, $3::uuid[]) as r`, [a, chosen, [chosenSign]])
    expect(r.r.plan).toBe('free')

    const s = await t.state(a)
    expect(s.plan).toBe('free')
    expect(s.unlockedListings).toEqual([chosen])
    expect(s.lockedListings).toEqual([busy])
    expect(s.unlockedSigns).toEqual([chosenSign])
    expect(s.lockedSigns).toEqual([busySign])
    expect(s.plan_choice_required_at).toBeNull()
    expect(s.free_listing_swapped_at).toBeNull()   // 'choose' never starts the 30-day clocks
    expect(s.free_signs_swapped_at).toBeNull()
  })

  it('Free swap mode still enforces and stamps its 30-day clocks', async () => {
    const a = await t.agent('free')
    const l1 = await t.listing(a, { scans: 5 })
    const l2 = await t.listing(a)
    await t.db.query(`update public.properties set plan_locked_at = now() where id = $1`, [l2])
    await t.one(`select public.apply_free_selection($1, 'swap', $2, '{}'::uuid[])`, [a, l2])
    expect((await t.state(a)).free_listing_swapped_at).toBeTruthy()
    await expect(t.one(`select public.apply_free_selection($1, 'swap', $2, '{}'::uuid[])`, [a, l1]))
      .rejects.toThrow(/swap_too_soon/)
  })
})

describe('apply_plan_selection (post-downgrade choice)', () => {
  const downgraded = async () => {
    const a = await t.agent('starter')
    const top = await t.listing(a, { scans: 9 })
    const other = await t.listing(a, { scans: 1 })
    const otherSign = await t.sign(a, { listing: other })
    await t.setPlan(a, 'free')
    return { a, top, other, otherSign }
  }

  it('applies the choice, clears the flag, and never stamps the swap clocks', async () => {
    const { a, top, other, otherSign } = await downgraded()
    expect((await t.state(a)).unlockedListings).toEqual([top])

    await t.one(`select public.apply_plan_selection($1, $2::uuid[], $3::uuid[])`, [a, [other], [otherSign]])
    const s = await t.state(a)
    expect(s.unlockedListings).toEqual([other])
    expect(s.lockedListings).toEqual([top])
    expect(s.unlockedSigns).toEqual([otherSign])
    expect(s.plan_choice_required_at).toBeNull()
    expect(s.free_listing_swapped_at).toBeNull()
    expect(s.free_signs_swapped_at).toBeNull()
  })

  it('takes several listings on Starter (limits from plan_limits)', async () => {
    const a = await t.agent('pro')
    const L = [] as string[]
    for (let i = 0; i < 5; i++) L.push(await t.listing(a, { scans: i }))
    await t.setPlan(a, 'starter')
    await t.one(`select public.apply_plan_selection($1, $2::uuid[], '{}'::uuid[])`, [a, [L[0], L[1], L[2]]])
    expect(new Set((await t.state(a)).unlockedListings)).toEqual(new Set([L[0], L[1], L[2]]))
    await expect(t.one(`select public.apply_plan_selection($1, $2::uuid[], '{}'::uuid[])`, [a, L.slice(0, 4)]))
      .rejects.toThrow(/no_choice_pending/) // flag already cleared by the first choice
  })

  it('refuses: no pending choice, too many, a sign on an unselected listing, exempt plans', async () => {
    const { a, top, other, otherSign } = await downgraded()
    await expect(t.one(`select public.apply_plan_selection($1, $2::uuid[], '{}'::uuid[])`, [a, [top, other]]))
      .rejects.toThrow(/too_many_listings/)
    await expect(t.one(`select public.apply_plan_selection($1, $2::uuid[], $3::uuid[])`, [a, [top], [otherSign]]))
      .rejects.toThrow(/invalid_sign/)

    const fresh = await t.agent('free')
    await expect(t.one(`select public.apply_plan_selection($1, '{}'::uuid[], '{}'::uuid[])`, [fresh]))
      .rejects.toThrow(/no_choice_pending/)
    const alpha = await t.agent('alpha')
    await expect(t.one(`select public.apply_plan_selection($1, '{}'::uuid[], '{}'::uuid[])`, [alpha]))
      .rejects.toThrow(/exempt_plan/)
  })
})

describe('protection', () => {
  it('a signed-in agent cannot set or clear plan_choice_required_at', async () => {
    const a = await t.agent('free')
    await t.asRole('authenticated')
    await expect(t.db.query(`update public.profiles set plan_choice_required_at = now() where id = $1`, [a]))
      .rejects.toThrow(/managed by the system/)
    await t.asRole(null)
  })

  it('a signed-in agent still cannot change their plan (so cannot trigger a fit)', async () => {
    const a = await t.agent('starter')
    await t.asRole('authenticated')
    await expect(t.db.query(`update public.profiles set plan = 'free' where id = $1`, [a])).rejects.toThrow(/managed by the system/)
    await t.asRole(null)
  })
})
