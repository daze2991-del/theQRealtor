// Single source of truth for per-plan QR code limits.
// Mirrors the server-side qr_limit_for_plan() DB function in migration 024.
// null = unlimited (elite plan).
export function qrLimitForPlan(plan: string): number | null {
  switch (plan) {
    case 'founding': return 10
    case 'starter':  return 3
    case 'pro':      return 10
    case 'elite':    return null
    default:         return 3  // free / unknown
  }
}
