import { PLAN_CONFIG, type PlanId } from './plans'
import { isPricingTier, pricingTierConfig } from './pricing'

/**
 * The customer-facing name of an agent's plan. One definition, shared by the
 * billing page and the Settings badge so the two can never disagree.
 * Starter/Pro read their name from the pricing catalog; founding/alpha are the
 * grandfathered "Beta Agent" cohort; anything unknown is Free (same fallback
 * as planConfig()).
 */
export function planDisplayName(plan: string | null | undefined): string {
  const id: PlanId = plan && plan in PLAN_CONFIG ? (plan as PlanId) : 'free'
  if (isPricingTier(id)) return pricingTierConfig(id).displayName
  if (id === 'founding' || id === 'alpha') return 'Beta Agent'
  if (id === 'trial') return 'Free Trial'
  return 'Free'
}
