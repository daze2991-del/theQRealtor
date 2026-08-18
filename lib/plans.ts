// Single source of truth for per-plan QR code limits.
// Mirrors the server-side qr_limit_for_plan() DB function in migration 024.
// null = unlimited (elite plan).
export function qrLimitForPlan(plan: string): number | null {
  switch (plan) {
    case 'founding': return 10
    case 'alpha':    return 10
    case 'starter':  return 3
    case 'pro':      return 10
    case 'elite':    return null
    default:         return 3  // free / unknown
  }
}

// Single source of truth for per-plan active-property limits. Starter caps at
// 3; founding/alpha/pro/elite are unlimited; free (or unrecognized) caps at 1.
// null = unlimited.
export function propertyLimitForPlan(plan: string): number | null {
  switch (plan) {
    case 'starter':  return 3
    case 'founding': return null
    case 'alpha':    return null
    case 'pro':      return null
    case 'elite':    return null
    default:         return 1  // free / unknown
  }
}
