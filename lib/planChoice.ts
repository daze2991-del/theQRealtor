import { buildActivityStats, RANKING_WINDOW_DAYS, FREE_MAX_LISTINGS, FREE_MAX_SIGNS, parseSwapTooSoon, swapTooSoonMessage, type ActivityStats } from './planLock'
import { getTrialStatus } from './trial'

// Server-side pieces of "Choose what stays active on Free". Used by:
//   GET  /api/plan/free-choice-options — what the agent can choose from, with ranking stats
//   POST /api/plan/choose-free         — expired trial → Free (apply_free_selection 'choose')
//   POST /api/plan/free-swap           — Free agent changes what's active ('swap')
// The atomic write and its rules live in SQL: apply_free_selection() in
// supabase/migrations/060_plan_locking.sql.

type Db = { from: (table: string) => any }

export interface ChoiceListing extends ActivityStats {
  address: string
  city: string | null
  state: string | null
  locked: boolean
}

export interface ChoiceSign extends ActivityStats {
  label: string
  locked: boolean
  /** Current assignment, or null when the sign is unassigned. */
  assignedPropertyId: string | null
}

export type ChoiceEligibility = 'choose' | 'swap' | null

/** 'choose' for an expired trial, 'swap' for a Free agent, otherwise null. */
export function choiceEligibility(plan: string | null | undefined, betaJoinedAt: string | null | undefined): ChoiceEligibility {
  if (plan === 'free') return 'swap'
  if (plan === 'trial' && getTrialStatus(betaJoinedAt, plan).expired) return 'choose'
  return null
}

export async function loadFreeChoiceOptions(admin: Db, agentId: string, now: number = Date.now()) {
  const sinceIso = new Date(now - RANKING_WINDOW_DAYS * 86_400_000).toISOString()

  const [{ data: props, error: propErr }, { data: signRows, error: signErr }] = await Promise.all([
    admin.from('properties')
      .select('id, address, city, state, created_at, plan_locked_at')
      .eq('user_id', agentId).eq('active', true).is('deleted_at', null),
    admin.from('signs')
      .select('id, label, created_at, plan_locked_at')
      .eq('agent_id', agentId).is('archived_at', null),
  ])
  if (propErr || signErr) throw new Error((propErr ?? signErr).message)

  const listings = (props ?? []) as any[]
  const signs = (signRows ?? []) as any[]
  const listingIds = listings.map(p => p.id)
  const signIds = signs.map(s => s.id)

  const none = Promise.resolve({ data: [], error: null })
  const [assignRes, pScans, pLeads, sScans, sLeads] = await Promise.all([
    signIds.length ? admin.from('sign_assignments').select('sign_id, property_id').in('sign_id', signIds).is('unassigned_at', null) : none,
    listingIds.length ? admin.from('scan_events').select('property_id, created_at').in('property_id', listingIds).gte('created_at', sinceIso) : none,
    listingIds.length ? admin.from('leads').select('property_id, created_at').in('property_id', listingIds).gte('created_at', sinceIso) : none,
    signIds.length ? admin.from('scan_events').select('sign_id, created_at').in('sign_id', signIds).gte('created_at', sinceIso) : none,
    signIds.length ? admin.from('leads').select('sign_id, created_at').in('sign_id', signIds).gte('created_at', sinceIso) : none,
  ])
  for (const r of [assignRes, pScans, pLeads, sScans, sLeads] as any[]) {
    if (r.error) throw new Error(r.error.message)
  }

  const assigned = new Map<string, string | null>()
  for (const a of (assignRes.data ?? []) as any[]) assigned.set(a.sign_id, a.property_id ?? null)

  const pStats = new Map(buildActivityStats(listings, pScans.data ?? [], pLeads.data ?? [], 'property_id', now).map(s => [s.id, s]))
  const sStats = new Map(buildActivityStats(signs, sScans.data ?? [], sLeads.data ?? [], 'sign_id', now).map(s => [s.id, s]))

  return {
    listings: listings.map((p): ChoiceListing => ({
      ...pStats.get(p.id)!,
      address: p.address ?? '', city: p.city ?? null, state: p.state ?? null,
      locked: !!p.plan_locked_at,
    })),
    signs: signs.map((s): ChoiceSign => ({
      ...sStats.get(s.id)!,
      label: s.label ?? '',
      locked: !!s.plan_locked_at,
      assignedPropertyId: assigned.get(s.id) ?? null,
    })),
  }
}

/** Validate a { listingIds, signIds } body. Caps are enforced again in SQL. */
export function parseSelection(body: unknown):
  { ok: true; listingId: string | null; signIds: string[] } | { ok: false; error: string } {
  const b = (body ?? {}) as { listingIds?: unknown; signIds?: unknown }
  const isIdList = (v: unknown): v is string[] => Array.isArray(v) && v.every(x => typeof x === 'string' && x.length > 0)
  const listingIds = b.listingIds ?? []
  const signIds = b.signIds ?? []
  if (!isIdList(listingIds) || !isIdList(signIds)) return { ok: false, error: 'Invalid selection.' }
  const uniqueListings = [...new Set(listingIds)]
  const uniqueSigns = [...new Set(signIds)]
  if (uniqueListings.length > FREE_MAX_LISTINGS) {
    return { ok: false, error: `Free keeps ${FREE_MAX_LISTINGS} listing active. Choose one.` }
  }
  if (uniqueSigns.length > FREE_MAX_SIGNS) {
    return { ok: false, error: `Free keeps up to ${FREE_MAX_SIGNS} signs active. Choose ${FREE_MAX_SIGNS} or fewer.` }
  }
  return { ok: true, listingId: uniqueListings[0] ?? null, signIds: uniqueSigns }
}

/** Map an apply_free_selection() exception to an HTTP response shape.
 *  A 30-day swap-limit refusal (migration 062) is 429 with nextChangeAt
 *  (ISO, UTC); the UI re-formats that date in the viewer's own timezone. */
export function selectionErrorResponse(message: string | undefined): { status: number; error: string; nextChangeAt?: string } {
  const m = message ?? ''
  const next = parseSwapTooSoon(m)
  if (next) return { status: 429, error: swapTooSoonMessage(next, 'en-US', 'UTC'), nextChangeAt: next }
  if (m.includes('invalid_listing')) return { status: 400, error: 'That listing can’t be kept active. Choose one of your live listings.' }
  if (m.includes('invalid_sign')) return { status: 400, error: 'Choose signs on the selected listing, or unassigned signs.' }
  if (m.includes('too_many_signs')) return { status: 400, error: `Free keeps up to ${FREE_MAX_SIGNS} signs active.` }
  if (m.includes('not_trial') || m.includes('not_free')) return { status: 409, error: 'Your plan changed. Refresh the page and try again.' }
  return { status: 500, error: 'Something went wrong. Please try again.' }
}

// ── Swap availability (migration 062) ────────────────────────────────────────
export interface SwapStatus {
  /** ISO time the active LISTING can next be changed; null = now. */
  listingNextAt: string | null
  /** ISO time an active SIGN can next be replaced; null = now. */
  signsNextAt: string | null
  /** Empty Free sign slots. Filling one is always allowed. */
  signSlotsOpen: number
}

type Rpc = { rpc: (fn: string, args: Record<string, unknown>) => any }

/** free_swap_availability() plus the open sign-slot count. Free agents only. */
export async function loadSwapStatus(admin: Db & Rpc, agentId: string): Promise<SwapStatus> {
  const [{ data: avail, error: availErr }, { count, error: countErr }] = await Promise.all([
    admin.rpc('free_swap_availability', { p_agent: agentId }),
    admin.from('signs').select('id', { count: 'exact', head: true })
      .eq('agent_id', agentId).is('archived_at', null).is('plan_locked_at', null),
  ])
  if (availErr || countErr) throw new Error((availErr ?? countErr).message)
  const row = (Array.isArray(avail) ? avail[0] : avail) ?? {}
  const iso = (v: unknown) => (typeof v === 'string' && v ? new Date(v).toISOString() : null)
  return {
    listingNextAt: iso(row.listing_next_at),
    signsNextAt: iso(row.signs_next_at),
    signSlotsOpen: Math.max(0, FREE_MAX_SIGNS - (count ?? 0)),
  }
}

/** The swap link is shown as a date (not clickable) only while nothing could change. */
export function signLinkBlockedUntil(s: SwapStatus | null): string | null {
  if (!s || !s.signsNextAt || s.signSlotsOpen > 0) return null
  return s.signsNextAt
}
