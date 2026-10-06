import { planConfig } from './plans'

// Sidebar plan-usage meters, derived from the enforced limits in lib/plans.ts.
// One meter per FINITE limit: listings and/or signs. A null limit (no cap)
// gets no meter — e.g. Pro shows signs only.
//
// `activeListings` must be counted exactly as app/api/properties enforces it
// (active = true AND not soft-deleted), and `activeSigns` exactly as
// app/api/signs/create does (archived_at IS NULL), so a meter reading "3 / 3"
// always means the next create will actually be refused.

export interface UsageMeter {
  key: 'listings' | 'signs'
  label: string
  used: number
  limit: number
}

export function planUsageMeters(plan: string | null | undefined, activeListings: number, activeSigns: number): UsageMeter[] {
  const { maxActiveListings, maxActiveSigns } = planConfig(plan)
  const meters: UsageMeter[] = []
  if (maxActiveListings !== null) meters.push({ key: 'listings', label: 'Listings used', used: activeListings, limit: maxActiveListings })
  if (maxActiveSigns !== null) meters.push({ key: 'signs', label: 'QR/Signs used', used: activeSigns, limit: maxActiveSigns })
  return meters
}

/** Above this many units the meter is drawn as one continuous bar, not segments. */
export const SEGMENTED_METER_MAX = 20
