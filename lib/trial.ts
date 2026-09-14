import { planConfig } from './plans'

// ── Trial window ─────────────────────────────────────────────────────────────
// The agent-facing free period. Formerly called "beta" — the DB columns still
// use the old name (profiles.beta_joined_at, account_status='beta'); only the
// language and this module were renamed. Do not rename those columns without a
// migration.

export interface TrialStatus {
  expired: boolean
  daysRemaining: number
  /** True when this plan has no trial clock at all — grandfathered cohorts,
   *  paying tiers, and the 'free' fallback. Distinct from `expired`: an exempt
   *  account is not "still within its trial", it has no trial. */
  exempt: boolean
}

export const TRIAL_DAYS = 45

/** Show the first (amber) warning at this many days remaining or fewer. */
export const TRIAL_WARN_DAYS = 10
/** Escalate to the urgent warning at this many days remaining or fewer. */
export const TRIAL_URGENT_DAYS = 3

/**
 * Trial state for an agent.
 *
 * `plan` is REQUIRED rather than optional on purpose. Most plans are exempt
 * from the trial clock, and their beta_joined_at dates are routinely older
 * than TRIAL_DAYS — so a call site that forgot to pass the plan would silently
 * report a grandfathered or PAYING account as expired and cut them off from
 * their own leads. Making the parameter required turns that mistake into a
 * compile error instead of an outage. Pass it even where it feels redundant.
 */
export function getTrialStatus(
  trialJoinedAt: string | null | undefined,
  plan: string | null | undefined,
): TrialStatus {
  // Checked FIRST, before the date math is even reachable. Only 'trial' is
  // subject to the clock — see subjectToTrialExpiry in lib/plans.ts for why
  // each of the others is exempt. This is what lets an agent upgrade out of an
  // already-expired trial and regain full access immediately: the moment their
  // plan becomes starter/pro/elite, expiry stops applying, without anyone
  // having to touch beta_joined_at.
  //
  // planConfig() falls back to 'free' for a null/unknown plan string, and
  // 'free' is exempt — so a typo'd plan costs revenue rather than locking a
  // real agent out of their own leads.
  if (!planConfig(plan).subjectToTrialExpiry) {
    return { expired: false, daysRemaining: TRIAL_DAYS, exempt: true }
  }

  if (!trialJoinedAt) {
    console.warn('[trial] beta_joined_at is null — failing open to avoid locking out a valid user')
    return { expired: false, daysRemaining: TRIAL_DAYS, exempt: false }
  }

  const expiresAt = new Date(trialJoinedAt).getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000
  const now = Date.now()
  const daysRemaining = Math.ceil((expiresAt - now) / (24 * 60 * 60 * 1000))
  return {
    expired: now > expiresAt,
    daysRemaining,
    exempt: false,
  }
}
