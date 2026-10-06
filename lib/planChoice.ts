import { buildActivityStats, RANKING_WINDOW_DAYS, FREE_MAX_LISTINGS, FREE_MAX_SIGNS, type ActivityStats } from './planLock'
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

/** Map an apply_free_selection() exception to an HTTP response shape. */
export function selectionErrorResponse(message: string | undefined): { status: number; error: string } {
  const m = message ?? ''
  if (m.includes('invalid_listing')) return { status: 400, error: 'That listing can’t be kept active. Choose one of your live listings.' }
  if (m.includes('invalid_sign')) return { status: 400, error: 'Choose signs on the selected listing, or unassigned signs.' }
  if (m.includes('too_many_signs')) return { status: 400, error: `Free keeps up to ${FREE_MAX_SIGNS} signs active.` }
  if (m.includes('not_trial') || m.includes('not_free')) return { status: 409, error: 'Your plan changed. Refresh the page and try again.' }
  return { status: 500, error: 'Something went wrong. Please try again.' }
}
