import 'server-only'
import type Stripe from 'stripe'
import type { createAdminSupabase } from './supabase-admin'
import { pricingTierConfig, type PricingTier } from './pricing'
import {
  AUTO_RENEWAL_CONSENT_VERSION,
  autoRenewalConsentText,
  type ConsentKind,
} from './autoRenewal'

// ── Server side of the California auto-renewal consent ───────────────────────
//
// checkout and change-plan call, in this order:
//   1. requireConsentFlag(body)        — before touching Stripe at all
//   2. checkConsentText(body, ...)     — what the browser says it showed must
//                                        equal what this server would show
//   3. verifyStripePrice(...)          — the amount disclosed IS the amount
//                                        Stripe will charge
//   4. recordConsent(...)              — proof row; no row, no charge
//   5. only then create the Checkout Session / change the subscription
//
// Every step fails closed.

type Db = ReturnType<typeof createAdminSupabase>

export type Refusal = { status: number; body: { error: string; code: string } }

/** 1. The request must say the box was ticked. Nothing else is trusted yet. */
export function requireConsentFlag(body: unknown): Refusal | null {
  if ((body as { consent?: unknown } | null)?.consent !== true) {
    return {
      status: 400,
      body: { error: 'Please tick the box to agree to automatic renewal.', code: 'consent_required' },
    }
  }
  return null
}

/**
 * 2. The version and the exact text must match what this server would have
 * shown for this plan and kind of purchase. A stale browser tab (old wording,
 * old price) is refused rather than recorded as consent to something it
 * didn't say. Returns the text to store.
 */
export function checkConsentText(
  body: unknown,
  tier: PricingTier,
  kind: ConsentKind,
): { ok: true; text: string } | { ok: false; refusal: Refusal } {
  const b = body as { consentVersion?: unknown; consentText?: unknown } | null
  const expected = autoRenewalConsentText(tier, kind)
  if (b?.consentVersion !== AUTO_RENEWAL_CONSENT_VERSION || b?.consentText !== expected) {
    return {
      ok: false,
      refusal: {
        status: 409,
        body: { error: 'This page is out of date. Please reload it and try again.', code: 'consent_outdated' },
      },
    }
  }
  return { ok: true, text: expected }
}

/**
 * 3. The live Stripe Price must be exactly the catalog price, in USD, billed
 * every 1 month, and active. Throws on a Stripe error (callers treat that as
 * "can't verify" and refuse).
 */
export async function verifyStripePrice(stripe: Stripe, priceId: string, tier: PricingTier): Promise<boolean> {
  const price = await stripe.prices.retrieve(priceId)
  const ok =
    price.active === true &&
    price.currency === 'usd' &&
    price.unit_amount === pricingTierConfig(tier).priceCents &&
    price.recurring?.interval === 'month' &&
    (price.recurring?.interval_count ?? 1) === 1
  if (!ok) {
    console.error(
      `[autoRenewal] Stripe price ${priceId} does not match the ${tier} catalog price ` +
      `(${price.unit_amount} ${price.currency} / ${price.recurring?.interval_count ?? 1} ${price.recurring?.interval}, active=${price.active}) — refusing`,
    )
  }
  return ok
}

/** 4. Store the proof. Returns false if it could not be written. */
export async function recordConsent(
  db: Db,
  input: { userId: string; tier: PricingTier; text: string; request: Request },
): Promise<boolean> {
  const h = input.request.headers
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || null
  const { error } = await db.from('auto_renewal_consents').insert({
    user_id: input.userId,
    plan: input.tier,
    price_cents: pricingTierConfig(input.tier).priceCents,
    interval: 'month',
    consent_text: input.text,
    consent_version: AUTO_RENEWAL_CONSENT_VERSION,
    ip,
    user_agent: h.get('user-agent') || null,
  })
  if (error) {
    console.error('[autoRenewal] could not store consent:', error.message)
    return false
  }
  return true
}
