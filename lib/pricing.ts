// ── Single source of truth for everything DISPLAYED about paid tiers ────────
//
// lib/plans.ts remains the single source of truth for what is ENFORCED
// (maxActiveSigns / maxActiveListings). This file never restates those
// numbers as literals — it reads them from planConfig() so the two files
// cannot drift. If lib/plans.ts changes a limit, every price display that
// reads from PRICING_CATALOG picks it up automatically.
//
// After this file exists, no other file in the repo should contain a
// literal price string ($39, $69, etc.) — they read displayPrice from here.

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
  /** Monthly price in cents — the amount the auto-renewal consent records and
   *  that checkout/change-plan verify against the live Stripe Price before
   *  charging. displayPrice is derived from this, never typed separately. */
  priceCents: number
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

// Card body copy, built from the enforced limits so the numbers can never
// drift from lib/plans.ts. A null listing limit reads "All your active
// listings" — customer-facing copy never says "unlimited".
function tierCopy(tier: PricingTier | 'free'): string {
  const { maxActiveListings: l, maxActiveSigns: s } = planConfig(tier)
  const signs = s === null ? 'all your active signs' : `${s} active sign${s === 1 ? '' : 's'}`
  if (l === null) return `All your active listings, up to ${signs}.`
  return `Up to ${l} active listing${l === 1 ? '' : 's'} and ${signs}.`
}

// TODO(annual): annual display/billing is inert while ANNUAL_BILLING_ENABLED
// is off. When annual billing is built, annual price = 20% off monthly
// (12 × monthly × 0.8 — Starter $374.40/yr, Pro $662.40/yr at today's
// monthly prices) — recalculate from the then-current monthly prices and
// create matching Stripe Prices; nothing here displays an annual price today.

/** 3900 → "$39/mo", 4950 → "$49.50/mo". */
export function dollars(cents: number): string {
  return Number.isInteger(cents / 100) ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`
}
function monthlyDisplay(cents: number): string {
  return `${dollars(cents)}/mo`
}

export const PRICING_CATALOG: Record<PricingTier, PricingTierConfig> = {
  starter: {
    tier: 'starter',
    displayName: 'Starter',
    displayPrice: monthlyDisplay(3900),
    priceCents: 3900,
    priceEnvVar: {
      month: 'STRIPE_PRICE_ID_STARTER_MONTHLY',
      year:  'STRIPE_PRICE_ID_STARTER_YEARLY',
    },
    copy: tierCopy('starter'),
    maxActiveListings: planConfig('starter').maxActiveListings,
    maxActiveSigns:    planConfig('starter').maxActiveSigns,
  },
  pro: {
    tier: 'pro',
    displayName: 'Pro',
    // ⚠️ DISPLAY price only. The live Stripe Price behind
    // STRIPE_PRICE_ID_PRO_MONTHLY still charges the OLD $79. Before
    // PAID_PLANS_ENABLED is turned on, create a NEW $69 Stripe Price and point
    // STRIPE_PRICE_ID_PRO_MONTHLY at its new Price ID. Never edit the old
    // Price — Stripe Prices are immutable, and existing subscriptions keep
    // the Price they were created with.
    displayPrice: monthlyDisplay(6900),
    priceCents: 6900,
    priceEnvVar: {
      month: 'STRIPE_PRICE_ID_PRO_MONTHLY',
      year:  'STRIPE_PRICE_ID_PRO_YEARLY',
    },
    copy: tierCopy('pro'),
    maxActiveListings: planConfig('pro').maxActiveListings,
    maxActiveSigns:    planConfig('pro').maxActiveSigns,
  },
}

/** Free tier as shown in the end-of-trial chooser. Not a Stripe tier, so it
 *  is not in PRICING_CATALOG. Limits come from lib/plans.ts like the others. */
export const FREE_TIER_DISPLAY = {
  displayName: 'Free',
  displayPrice: '$0',
  copy: tierCopy('free'),
  maxActiveListings: planConfig('free').maxActiveListings,
  maxActiveSigns: planConfig('free').maxActiveSigns,
} as const

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

/**
 * Reverse of resolvePriceId: which paid tier a Stripe Price ID belongs to,
 * read from the same env vars at call time. Used by the Stripe webhook to set
 * profiles.plan — the plan is always derived server-side from the price on
 * the subscription, never from anything a client or event metadata claims.
 * Returns null for an unknown/empty price ID; callers must change nothing.
 */
export function planForPriceId(priceId: string | null | undefined): PricingTier | null {
  if (!priceId) return null
  for (const tier of PRICING_TIERS) {
    for (const interval of ['month', 'year'] as const) {
      if (resolvePriceId(tier, interval) === priceId) return tier
    }
  }
  return null
}

/** Short badge on the marketing hero. */
export const INVITING_BADGE = 'Now inviting agents · Free plan available'

/** Extra line under each paid card's body copy on the marketing page. */
export const TIER_HIGHLIGHTS: Record<PricingTier, string> = {
  starter: 'Lead scoring, text alerts and Needs Your Attention.',
  pro: 'Everything in Starter.',
}

/** Free card body on the marketing page; limits are read from lib/plans.ts. */
export function freeCardCopy(): string {
  const { maxActiveListings: l, maxActiveSigns: s } = planConfig('free')
  const listings = l === null ? 'All your active listings' : `${l} active listing${l === 1 ? '' : 's'}`
  const signs = s === null ? 'all your active signs' : `${s} active sign${s === 1 ? '' : 's'}`
  return `${listings} and ${signs}. Buyer inquiries with full contact details, by email.`
}
