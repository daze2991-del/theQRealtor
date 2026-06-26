export interface BetaStatus {
  expired: boolean
  daysRemaining: number
}

const BETA_DAYS = 90

export function getBetaStatus(betaJoinedAt: string | null | undefined): BetaStatus {
  if (!betaJoinedAt) {
    console.warn('[beta] beta_joined_at is null — failing open to avoid locking out a valid user')
    return { expired: false, daysRemaining: BETA_DAYS }
  }
  const expiresAt = new Date(betaJoinedAt).getTime() + BETA_DAYS * 24 * 60 * 60 * 1000
  const now = Date.now()
  const msRemaining = expiresAt - now
  const daysRemaining = Math.ceil(msRemaining / (24 * 60 * 60 * 1000))
  return {
    expired: now > expiresAt,
    daysRemaining,
  }
}
