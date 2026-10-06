import { getTrialStatus, TRIAL_DAYS } from './trial'

// ── Agent-facing end-of-trial copy (dashboard only, never buyer pages) ──────
export const TRIAL_ENDED_INTRO =
  `Your ${TRIAL_DAYS}-day trial has ended. Nothing has been deleted — choose a plan to keep receiving buyer requests.`
export const CHOOSE_PLAN_BANNER = 'Choose a plan to start receiving buyer requests again'
export function trialEndingBanner(daysRemaining: number): string {
  const days = `${daysRemaining} day${daysRemaining === 1 ? '' : 's'}`
  return `Your trial ends in ${days}. After that, choose Free, Starter or Pro — nothing is deleted.`
}

// ── Plan locking: what buyers can do on a listing / sign ─────────────────────
//
// A listing or sign stops taking buyer requests when ANY of these hold:
//   • properties.plan_locked_at is set (not kept active on the agent's plan)
//   • the scanned sign's signs.plan_locked_at is set
//   • the owning agent's trial has expired and they haven't chosen a plan yet.
//     This one is computed from the trial clock; nothing is stamped for it.
//
// Listing info (photos, price, description, map) stays visible either way, and
// the agent's dashboard keeps everything. The buyer is never told why: no plan,
// billing or trial wording leaves the server.
//
// Columns and protection: supabase/migrations/060_plan_locking.sql.

/** Shown to buyers in place of the request buttons and form.
 *  PROVISIONAL — pending attorney review. */
export const REQUESTS_PAUSED_COPY =
  "This listing isn't taking requests through this page right now. Please contact the listing agent directly."

/** Dashboard badge on a locked listing or sign. */
export const NOT_TAKING_REQUESTS_LABEL = 'Not taking requests'
export const NOT_TAKING_REQUESTS_TOOLTIP =
  "Buyers can still view this, but can't send requests through it. It isn't one of the items kept active on your plan."

// Minimal structural type so both the real admin client and the test fake fit.
type Db = { from: (table: string) => any }

/**
 * Whether buyers may send a request for this listing (optionally via this sign).
 * Fails OPEN on a lookup error, with a log. The safer way to be wrong is a
 * request reaching an agent, not a paying agent silently losing leads.
 * Callers still do their own "listing exists and is active" check.
 */
export async function isAcceptingRequests(
  admin: Db,
  propertyId: string,
  signId?: string | null,
): Promise<boolean> {
  const { data: property, error: propError } = await admin
    .from('properties')
    .select('id, user_id, plan_locked_at')
    .eq('id', propertyId)
    .maybeSingle()
  if (propError) {
    console.error('[planLock] property lookup error:', propError.message)
    return true
  }
  if (!property) return true // not found is the caller's 404, not a lock
  if (property.plan_locked_at) return false

  if (signId) {
    const { data: sign, error: signError } = await admin
      .from('signs')
      .select('id, plan_locked_at')
      .eq('id', signId)
      .maybeSingle()
    if (signError) console.error('[planLock] sign lookup error:', signError.message)
    else if (sign?.plan_locked_at) return false
  }

  if (property.user_id) {
    const { data: owner, error: ownerError } = await admin
      .from('profiles')
      .select('plan, beta_joined_at')
      .eq('id', property.user_id)
      .maybeSingle()
    if (ownerError) {
      console.error('[planLock] owner lookup error:', ownerError.message)
    } else if (owner && getTrialStatus(owner.beta_joined_at, owner.plan).expired) {
      return false
    }
  }

  return true
}

// ── "Choose what stays active on Free": recommendation ranking ───────────────
// Ranked by scans in the last 30 days, then leads in the last 30 days, then
// most recent activity (latest scan/lead in that window, else created_at).
// Pure, so the chooser UI and the tests share one implementation.

export const RANKING_WINDOW_DAYS = 30

export interface ActivityStats {
  id: string
  scans30: number
  leads30: number
  /** ISO timestamp of the latest scan/lead in the window, else created_at. */
  lastActivityAt: string
}

export function rankByActivity<T extends ActivityStats>(items: readonly T[]): T[] {
  return [...items].sort((a, b) =>
    (b.scans30 - a.scans30)
    || (b.leads30 - a.leads30)
    || (Date.parse(b.lastActivityAt) - Date.parse(a.lastActivityAt))
    || a.id.localeCompare(b.id))
}

/** scan_events / leads use `timestamp without time zone`; read those as UTC. */
export function parseDbTime(t: string | null | undefined): number {
  if (!t) return NaN
  return Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(t) ? t : `${t}Z`)
}

/** Build per-item stats from raw scan/lead rows. `key` is the column that
 *  links a row to an item ('property_id' or 'sign_id'). */
export function buildActivityStats(
  items: readonly { id: string; created_at: string }[],
  scans: readonly Record<string, any>[],
  leads: readonly Record<string, any>[],
  key: 'property_id' | 'sign_id',
  now: number = Date.now(),
): ActivityStats[] {
  const since = now - RANKING_WINDOW_DAYS * 86_400_000
  return items.map(item => {
    let scans30 = 0, leads30 = 0, latest = NaN
    for (const s of scans) {
      if (s[key] !== item.id) continue
      const t = parseDbTime(s.created_at)
      if (t >= since) { scans30++; if (!(t <= latest)) latest = t }
    }
    for (const l of leads) {
      if (l[key] !== item.id) continue
      const t = parseDbTime(l.created_at)
      if (t >= since) { leads30++; if (!(t <= latest)) latest = t }
    }
    const lastActivityAt = Number.isNaN(latest) ? item.created_at : new Date(latest).toISOString()
    return { id: item.id, scans30, leads30, lastActivityAt }
  })
}

export const FREE_MAX_LISTINGS = 1
export const FREE_MAX_SIGNS = 3
