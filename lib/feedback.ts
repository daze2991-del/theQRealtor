// ── Feedback prompt policy ──────────────────────────────────────────────────
// Shared constants + eligibility math for the weekly in-app feedback prompt.
// Kept deliberately simple: account-age gate + a cooldown timestamp. The richer
// "meaningful usage" gating (N scans / M sessions) is intentionally NOT here yet.

export const ACCOUNT_MIN_AGE_DAYS = 7   // first prompt only after 7+ days
export const SHOWN_COOLDOWN_DAYS = 3     // shown but ignored → don't reappear for ~3 days
export const DISMISS_COOLDOWN_DAYS = 14  // "Not now" → ask again in ~2 weeks
export const SUBMIT_COOLDOWN_DAYS = 30   // real response → ask again in ~1 month

export const MAX_COMMENT_LEN = 2000

const DAY_MS = 86_400_000

export function daysFromNow(days: number, now: Date = new Date()): Date {
  return new Date(now.getTime() + days * DAY_MS)
}

// Eligible when the account is old enough AND no active cooldown is in effect.
// A missing state row means never prompted → eligible once old enough.
export function isEligible(params: {
  accountCreatedAt: string | null | undefined
  nextEligibleAt: string | null | undefined
  now?: Date
}): boolean {
  const now = params.now ?? new Date()

  if (!params.accountCreatedAt) return false
  const ageDays = (now.getTime() - new Date(params.accountCreatedAt).getTime()) / DAY_MS
  if (ageDays < ACCOUNT_MIN_AGE_DAYS) return false

  if (params.nextEligibleAt && new Date(params.nextEligibleAt).getTime() > now.getTime()) {
    return false
  }
  return true
}
