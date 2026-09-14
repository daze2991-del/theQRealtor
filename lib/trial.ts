import { planConfig } from './plans'

// ── Trial window ─────────────────────────────────────────────────────────────
// The agent-facing free period. Formerly called "beta" — the DB columns still
// use the old name (profiles.beta_joined_at, account_status='beta'); only the
// language and this module were renamed. Do not rename those columns without a
// migration.

export interface TrialStatus {
  expired: boolean
  daysRemaining: number
  /** True when the plan is a grandfathered cohort that never expires. */
  grandfathered: boolean
}

export const TRIAL_DAYS = 45

/** Show the first (amber) warning at this many days remaining or fewer. */
export const TRIAL_WARN_DAYS = 10
/** Escalate to the urgent warning at this many days remaining or fewer. */
export const TRIAL_URGENT_DAYS = 3

/**
 * Trial state for an agent.
 *
 * `plan` is REQUIRED rather than optional on purpose. Grandfathered cohorts
 * (founding / alpha) must never expire, and their beta_joined_at dates are
 * already far older than TRIAL_DAYS — so a call site that forgot to pass the
 * plan would silently report them as expired and lock a real, permanent
 * account out. Making the parameter required turns that mistake into a
 * compile error instead of an outage. Pass it even where it feels redundant.
 */
export function getTrialStatus(
  trialJoinedAt: string | null | undefined,
  plan: string | null | undefined,
): TrialStatus {
  // Checked FIRST, before the date math is even reachable — a grandfathered
  // plan is exempt regardless of how old its join date is. planConfig() falls
  // back to the restrictive 'free' config for null/unknown plans, so an
  // unrecognised plan string is treated as NOT grandfathered (fails safe).
  if (planConfig(plan).grandfathered) {
    return { expired: false, daysRemaining: TRIAL_DAYS, grandfathered: true }
  }

  if (!trialJoinedAt) {
    console.warn('[trial] beta_joined_at is null — failing open to avoid locking out a valid user')
    return { expired: false, daysRemaining: TRIAL_DAYS, grandfathered: false }
  }

  const expiresAt = new Date(trialJoinedAt).getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000
  const now = Date.now()
  const daysRemaining = Math.ceil((expiresAt - now) / (24 * 60 * 60 * 1000))
  return {
    expired: now > expiresAt,
    daysRemaining,
    grandfathered: false,
  }
}
