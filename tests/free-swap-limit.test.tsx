// Free swap limit (migration 062) and dashboard badges that match what buyers
// see. Supabase is mocked; the SQL clock logic is verified live in a
// rolled-back transaction with throwaway accounts (see the task report).

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'fs'
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

const { requestsPausedReason, isAcceptingRequests, parseSwapTooSoon, swapTooSoonMessage, formatChangeDate } = await import('../lib/planLock')
const { selectionErrorResponse, signLinkBlockedUntil } = await import('../lib/planChoice')
const { POST: freeSwap } = await import('../app/api/plan/free-swap/route')
const { GET: swapStatus } = await import('../app/api/plan/free-swap-status/route')

const DAY = 86_400_000
const daysAgo = (n: number) => new Date(Date.now() - n * DAY).toISOString()
const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const sql = src('supabase/migrations/062_free_swap_limit.sql')
const NEXT = '2026-11-05T22:30:00Z'

beforeEach(() => {
  user = { id: AGENT }
  db = makeFakeDb()
  db.tables.profiles = [{ id: AGENT, plan: 'free', beta_joined_at: daysAgo(100) }]
  db.tables.properties = [{ id: 'P1', user_id: AGENT, active: true, deleted_at: null, plan_locked_at: null }]
  db.tables.signs = []
  for (const k of ['log', 'warn', 'error'] as const) vi.spyOn(console, k).mockImplementation(() => {})
})

const swap = (body: unknown) => freeSwap(new Request('https://x/api/plan/free-swap', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
}))

// ── Part 1: swap limit ───────────────────────────────────────────────────────
describe('swap-limit refusal reaches the agent with the next allowed date', () => {
  it('parses the SQL refusal', () => {
    expect(parseSwapTooSoon(`swap_too_soon:${NEXT}`)).toBe(NEXT)
    expect(parseSwapTooSoon('invalid_sign')).toBeNull()
  })

  it('message wording: "You can change this again on {date}."', () => {
    expect(swapTooSoonMessage(NEXT, 'en-US', 'UTC')).toBe('You can change this again on November 5, 2026.')
    // The viewer's timezone decides the calendar date shown
    expect(formatChangeDate('2026-11-06T03:00:00Z', 'en-US', 'America/Los_Angeles')).toBe('November 5, 2026')
  })

  it('free-swap returns 429 + nextChangeAt when the database refuses, and changes nothing else', async () => {
    db.rpcs.apply_free_selection = () => ({ error: { message: `swap_too_soon:${NEXT}` } })
    const res = await swap({ listingIds: ['P2'], signIds: [] })
    expect(res.status).toBe(429)
    expect(await res.json()).toEqual({ error: 'You can change this again on November 5, 2026.', nextChangeAt: NEXT })
  })

  it('other refusals keep their old mapping (no nextChangeAt)', () => {
    expect(selectionErrorResponse('invalid_sign')).toEqual({ status: 400, error: 'Choose signs on the selected listing, or unassigned signs.' })
  })

  it('free-swap-status: Free agent gets the dates; anyone else 403', async () => {
    db.rpcs.free_swap_availability = () => ({ data: [{ listing_next_at: '2026-11-05T22:30:00+00:00', signs_next_at: null }] })
    db.tables.signs = [
      { id: 's1', agent_id: AGENT, archived_at: null, plan_locked_at: null },
      { id: 's2', agent_id: AGENT, archived_at: daysAgo(1), plan_locked_at: null },   // archived: frees a slot
      { id: 's3', agent_id: AGENT, archived_at: null, plan_locked_at: daysAgo(1) },   // locked: not in use
    ]
    const body = await (await swapStatus()).json()
    expect(body).toEqual({ listingNextAt: '2026-11-05T22:30:00.000Z', signsNextAt: null, signSlotsOpen: 2 })

    db.tables.profiles[0].plan = 'trial'
    expect((await swapStatus()).status).toBe(403)
  })

  it('sign link shows a date only while a replacement is blocked AND no slot is open', () => {
    expect(signLinkBlockedUntil({ listingNextAt: null, signsNextAt: NEXT, signSlotsOpen: 0 })).toBe(NEXT)
    expect(signLinkBlockedUntil({ listingNextAt: null, signsNextAt: NEXT, signSlotsOpen: 1 })).toBeNull()  // e.g. a sign was archived
    expect(signLinkBlockedUntil({ listingNextAt: null, signsNextAt: null, signSlotsOpen: 0 })).toBeNull()
    expect(signLinkBlockedUntil(null)).toBeNull()
  })

  it('Properties / Signs pages show the date instead of the link while the limit applies', () => {
    const props = src('app/dashboard/properties/page.tsx')
    expect(props).toMatch(/\{listingNextAt\s*\?\s*<span[^>]*>You can change which one on \{formatChangeDate\(listingNextAt\)\}\.<\/span>\s*:\s*<Link href="\/dashboard\/settings#free-plan"/)
    const signs = src('app/dashboard/signs/page.tsx')
    expect(signs).toMatch(/\{signLinkBlockedUntil\(swapStatus\)\s*\?\s*<span[^>]*>You can change which signs are active on/)
  })

  it('the Settings panel shows the refusal date in the viewer timezone', () => {
    const fs = src('components/FreeSelection.tsx')
    expect(fs).toContain("res.status === 429 && typeof body.nextChangeAt === 'string'")
    expect(fs).toContain('swapTooSoonMessage(body.nextChangeAt)')
  })
})

describe('migration 062 rules (SQL text; behaviour verified live)', () => {
  it('protects both new columns from client writes, keeps every older column and the fixed search_path', () => {
    for (const c of ['plan', 'subscription_status', 'price_id', 'stripe_customer_id', 'stripe_subscription_id', 'current_period_end',
      'cancel_at_period_end', 'trial_end', 'is_founding', 'cancel_at', 'cancellation_reason', 'last_payment_failed_at',
      'account_status', 'billing_interval', 'free_listing_swapped_at', 'free_signs_swapped_at']) {
      expect(sql).toMatch(new RegExp(`new\\.${c}\\s+is distinct from old\\.${c}`))
    }
    expect(sql).toMatch(/create or replace function public\.protect_profile_entitlements\(\)\s+returns trigger\s+language plpgsql\s+set search_path = public/)
  })

  it('the limit is checked only in swap mode, so the first Free choice never meets the clock', () => {
    const fn = sql.slice(sql.indexOf('create or replace function public.apply_free_selection'))
    const swapBlock = fn.slice(fn.indexOf("if p_mode = 'swap' then"), fn.indexOf("if p_mode = 'choose' then"))
    expect(swapBlock).toContain("raise exception 'swap_too_soon:%'")
    expect(fn.split("raise exception 'swap_too_soon:%'").length - 1).toBe(2)  // both raises live in that block
    // Clocks are stamped only from flags that are set inside the swap block
    expect(fn).toMatch(/if v_listing_change then\s+update public\.profiles set free_listing_swapped_at = v_now/)
    expect(fn).toMatch(/elsif v_sign_change then\s+update public\.profiles set free_signs_swapped_at = v_now/)
    expect(fn).toMatch(/v_listing_change boolean := false;\s+v_sign_change\s+boolean := false;/)
  })

  it('30-day window, and the "active listing no longer live" exception', () => {
    expect(sql.match(/interval '30 days'/g)!.length).toBeGreaterThanOrEqual(6)
    expect(sql).toMatch(/v_listing_change := v_cur_listing is not null and v_cur_listing is distinct from p_listing;/)
    expect(sql).toMatch(/where user_id = p_agent and plan_locked_at is null\s+and coalesce\(active, false\) and deleted_at is null/)
  })

  it('new functions are service-role only', () => {
    expect(sql).toContain('revoke all on function public.free_swap_availability(uuid) from public, anon, authenticated;')
    expect(sql).toContain('revoke all on function public.apply_free_selection(uuid, text, uuid, uuid[]) from public, anon, authenticated;')
  })
})

// ── Part 2: one pause rule for buyers and dashboard ──────────────────────────
describe('requestsPausedReason: the single rule', () => {
  const expired = { plan: 'trial', beta_joined_at: daysAgo(46) }
  const live    = { plan: 'trial', beta_joined_at: daysAgo(10) }
  const alpha   = { plan: 'alpha', beta_joined_at: daysAgo(400) }

  it.each([
    ['unlocked listing, live trial',       { owner: live }, null],
    ['locked listing',                     { listingLockedAt: daysAgo(1), owner: live }, 'locked'],
    ['expired trial, nothing locked',      { owner: expired }, 'trial_ended'],
    ['locked sign',                        { signLockedAt: daysAgo(1), owner: live }, 'locked'],
    ['unlocked sign on a locked listing',  { listingLockedAt: daysAgo(1), owner: live }, 'locked'],
    ['founder (alpha), old join date',     { owner: alpha }, null],
    ['owner unknown never pauses',         { owner: null }, null],
  ] as const)('%s', (_l, input, want) => {
    expect(requestsPausedReason(input as any)).toBe(want)
  })

  it('the buyer-side check agrees with it on every combination', async () => {
    for (const listingLocked of [false, true]) for (const signLocked of [false, true]) for (const owner of [live, expired, alpha]) {
      db = makeFakeDb()
      db.tables.profiles = [{ id: AGENT, ...owner }]
      db.tables.properties = [{ id: 'P1', user_id: AGENT, plan_locked_at: listingLocked ? daysAgo(1) : null }]
      db.tables.signs = [{ id: 'S1', plan_locked_at: signLocked ? daysAgo(1) : null }]
      const dashboard = requestsPausedReason({ listingLockedAt: listingLocked ? 'x' : null, signLockedAt: signLocked ? 'x' : null, owner })
      expect(await isAcceptingRequests(db.client, 'P1', 'S1'), JSON.stringify({ listingLocked, signLocked, owner })).toBe(dashboard === null)
    }
  })
})

describe('dashboard never shows the green badge next to "Not taking requests"', () => {
  it('Properties list: one slot, grey badge OR the green Active toggle', () => {
    const s = src('app/dashboard/properties/page.tsx')
    expect(s).toMatch(/\{pausedReason\s*\?\s*<NotTakingRequestsBadge reason=\{pausedReason\} \/>\s*:\s*<StatusBadge /)
    expect(s.match(/<NotTakingRequestsBadge/g)).toHaveLength(1)
    expect(s.match(/<StatusBadge /g)).toHaveLength(1)
    expect(s).toContain('pausedReason={requestsPausedReason({ listingLockedAt: prop.plan_locked_at, owner })}')
    expect(s).toContain("select('plan, beta_joined_at')")
  })

  it('Property detail: "Active Listing" is hidden whenever paused', () => {
    const s = src('app/dashboard/properties/[propertyId]/page.tsx')
    expect(s).toContain('const pausedReason = requestsPausedReason({ listingLockedAt: property.plan_locked_at, owner })')
    expect(s).toContain("{(isArchived || !pausedReason || !property.active) && (")
    expect(s).toContain('{pausedReason && !isArchived && <NotTakingRequestsBadge size="md" reason={pausedReason} />}')
  })

  it('Signs: an assigned paused sign shows the grey badge in place of green "Assigned"', () => {
    const s = src('app/dashboard/signs/page.tsx')
    expect(s).toMatch(/\{assigned && pausedReason \? \(\s*<NotTakingRequestsBadge reason=\{pausedReason\} \/>\s*\) : assigned \? \(/)
    expect(s).toContain('listingLockedAt: sign.current_assignment?.properties?.plan_locked_at ?? null')
    expect(s).toContain("select('plan, beta_joined_at')")
    // the sign list and assign responses carry the listing lock the rule needs
    expect(src('app/api/signs/route.ts')).toContain('properties(id, address, city, state, plan_locked_at)')
    expect(src('app/api/signs/assign/route.ts')).toContain('properties(id, address, city, state, plan_locked_at)')
  })
})

describe('migration 063: no live listing → neither clock applies', () => {
  const fix = src('supabase/migrations/063_free_swap_limit_fix.sql')
  const fn = fix.slice(fix.indexOf('create or replace function public.apply_free_selection'))
  const avail = fix.slice(fix.indexOf('create or replace function public.free_swap_availability'), fix.indexOf('create or replace function public.apply_free_selection'))

  it('the signs clock is checked only on the SAME live listing', () => {
    expect(fn).toMatch(/if v_listing_change then[\s\S]*?elsif v_cur_listing is not null then\s+-- 063[\s\S]*?v_sign_change := exists \(/)
    expect(fn).not.toMatch(/\n\s+else\s+v_sign_change := exists/)   // the 062 bug: an unconditional else
  })

  it('so a listing that went offline/deleted can be replaced immediately, even with the signs clock running', () => {
    // v_cur_listing is NULL exactly when no unlocked live listing exists; then
    // v_listing_change is false AND the signs branch is skipped → no refusal.
    expect(fn).toMatch(/v_listing_change := v_cur_listing is not null and v_cur_listing is distinct from p_listing;/)
    expect(fn).toMatch(/select id into v_cur_listing\s+from public\.properties\s+where user_id = p_agent and plan_locked_at is null\s+and coalesce\(active, false\) and deleted_at is null/)
  })

  it('free_swap_availability agrees: no live listing → signs_next_at is NULL', () => {
    const signsCase = avail.slice(avail.indexOf('signs_next_at := case'))
    expect(signsCase).toMatch(/v_s \+ interval '30 days' > now\(\)\s+and exists \(select 1 from public\.properties\s+where user_id = p_agent and plan_locked_at is null\s+and coalesce\(active, false\) and deleted_at is null\)/)
  })

  it('063 is 062 plus only the marked lines', () => {
    const lines = (t: string) => t.slice(t.indexOf('create or replace function public.free_swap_availability')).split('\n')
    const multisetMinus = (a: string[], b: string[]) => {
      const left = [...b]
      return a.filter(l => { const i = left.indexOf(l); if (i === -1) return true; left.splice(i, 1); return false })
    }
    const before = lines(sql), after = lines(fix)
    expect(multisetMinus(before, after)).toEqual([
      '-- Identical to 060 except the blocks marked "062".',
      '    else',
    ])
    expect(multisetMinus(after, before)).toEqual([
      '  -- 063: no live listing → a fresh listing choice, so no signs clock either.',
      '     and exists (select 1 from public.properties',
      '                 where user_id = p_agent and plan_locked_at is null',
      '                   and coalesce(active, false) and deleted_at is null)',
      '-- Identical to 062 except the lines marked "063".',
      '    elsif v_cur_listing is not null then',
      '      -- 063: signs-only change on the SAME live listing. With no live listing',
      "      -- (it sold / went offline) the agent is choosing a new listing, and the",
      "      -- old listing's signs leaving is part of that, not a sign swap.",
    ])
  })
})
