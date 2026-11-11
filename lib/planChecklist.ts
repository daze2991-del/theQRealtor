import { PLAN_CONFIG, planConfig } from './plans'

// Customer-facing limit copy. A null limit is phrased as "All your active
// <noun>s" rather than "Unlimited" — same rule Phase 5/6 apply everywhere else.
export function limitLabel(n: number | null, noun: string): string {
  return n === null ? `All your active ${noun}s` : `${n} active ${noun}${n === 1 ? '' : 's'}`
}

export interface ChecklistItem {
  label: string
  included: boolean
  /** Muted explanatory line shown instead of a checkmark when not included. */
  note?: string
}

export const NOT_INCLUDED_NOTE = 'Not included — available on paid plans'

/**
 * The "what's included" list on the billing page, driven by lib/plans.ts
 * (limits + PlanFeatures). An unknown/typo'd plan string is Free, same as
 * planConfig(). Paid plans keep the list they have always seen, under the
 * existing "Your Beta Agent Plan" heading.
 */
export function planChecklist(plan: string | null | undefined): { heading: string; items: ChecklistItem[] } {
  const isFree = !plan || !(plan in PLAN_CONFIG) || plan === 'free'
  const cfg = planConfig(plan)
  const f = cfg.features

  if (isFree) {
    return {
      heading: 'Your Free plan includes',
      items: [
        { label: limitLabel(cfg.maxActiveListings, 'listing'), included: true },
        { label: limitLabel(cfg.maxActiveSigns, 'sign'), included: true },
        { label: 'Buyer lead capture with full contact info', included: true },
        { label: 'QR sign tracking', included: true },
        { label: 'Email lead alerts', included: f.canUseEmailAlerts },
        { label: 'Buyer interest scoring (Hot/Warm/Cold)', included: f.leadScoring, note: NOT_INCLUDED_NOTE },
        { label: 'SMS lead alerts', included: f.canUseSms, note: NOT_INCLUDED_NOTE },
      ].filter(i => i.included || i.note),
    }
  }

  return {
    heading: 'Your Beta Agent Plan',
    items: [
      { label: 'All your active listings', included: true },
      { label: 'Buyer lead capture', included: true },
      { label: 'QR sign tracking', included: true },
      { label: 'Buyer interest scoring (Hot/Warm/Cold)', included: f.leadScoring, note: NOT_INCLUDED_NOTE },
      { label: 'SMS lead alerts', included: f.canUseSms, note: NOT_INCLUDED_NOTE },
      { label: 'Seller reports', included: true },
      { label: 'Analytics dashboard', included: true },
      { label: 'CSV export', included: true },
      { label: 'Priority support', included: true },
    ],
  }
}
