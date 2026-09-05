// ── Single source of truth for everything DISPLAYED about paid tiers ────────
//
// lib/plans.ts remains the single source of truth for what is ENFORCED
// (maxActiveSigns / maxActiveListings). This file never restates those
// numbers as literals — it reads them from planConfig() so the two files
// cannot drift. If lib/plans.ts changes a limit, every price display that
// reads from PRICING_CATALOG picks it up automatically.
//
// After this file exists, no other file in the repo should contain a
// literal price string ($39, $79, etc.) — they read displayPrice from here.

import { planConfig } from './plans'

export type PricingTier = 'starter' | 'pro'
export type BillingInterval = 'month' | 'year'

export const PRICING_TIERS: readonly PricingTier[] = ['starter', 'pro'] as const

export interface PricingTierConfig {
  tier: PricingTier
  displayName: string
  /** Monthly price as shown to users. Annual display is inert until
   *  ANNUAL_BILLING_ENABLED — see app/api/stripe/checkout/route.ts. */
  displayPrice: string
  /** Env var names holding this tier's Stripe Price IDs. `year` exists so the
   *  shape is ready for annual billing, but resolvePriceId() rejects
   *  interval:'year' unless ANNUAL_BILLING_ENABLED is true. */
  priceEnvVar: Record<BillingInterval, string>
  /** Card body copy — the one factual sentence describing what this tier gets. */
  copy: string
  /** Derived from lib/plans.ts — never hand-typed here. */
  maxActiveListings: number | null
  maxActiveSigns: number | null
}

/** Shown under every tier card, identical wording both places. */
export const PRICING_CLARIFIER =
  'Listings and signs are separate. A listing can have multiple signs, and each active sign can capture buyer engagement and inquiries.'

export const PRICING_CATALOG: Record<PricingTier, PricingTierConfig> = {
  starter: {
    tier: 'starter',
    displayName: 'Starter',
    displayPrice: '$39/mo',
    priceEnvVar: {
      month: 'STRIPE_PRICE_ID_STARTER_MONTHLY',
      year:  'STRIPE_PRICE_ID_STARTER_YEARLY',
    },
    copy: 'Up to 3 active listings and 5 active signs.',
    maxActiveListings: planConfig('starter').maxActiveListings,
    maxActiveSigns:    planConfig('starter').maxActiveSigns,
  },
  pro: {
    tier: 'pro',
    displayName: 'Pro',
    displayPrice: '$79/mo',
    priceEnvVar: {
      month: 'STRIPE_PRICE_ID_PRO_MONTHLY',
      year:  'STRIPE_PRICE_ID_PRO_YEARLY',
    },
    copy: 'All your active listings, up to 25 active signs.',
    maxActiveListings: planConfig('pro').maxActiveListings,
    maxActiveSigns:    planConfig('pro').maxActiveSigns,
  },
}

export function isPricingTier(value: unknown): value is PricingTier {
  return value === 'starter' || value === 'pro'
}

export function pricingTierConfig(tier: PricingTier): PricingTierConfig {
  return PRICING_CATALOG[tier]
}

/**
 * Resolves a tier + interval to its live Stripe Price ID, reading the env var
 * at CALL TIME (not module load) so a config change takes effect without a
 * redeploy. Returns null if the env var is missing/empty — callers must treat
 * that as a configuration error, never fall back to a different price ID or
 * a different tier.
 */
export function resolvePriceId(tier: PricingTier, interval: BillingInterval): string | null {
  const envVarName = PRICING_CATALOG[tier].priceEnvVar[interval]
  const value = process.env[envVarName]
  return value ? value : null
}
