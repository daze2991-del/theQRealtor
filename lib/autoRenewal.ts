import { dollars, pricingTierConfig, type PricingTier } from './pricing'

// ── California automatic-renewal disclosure + consent wording ───────────────
//
// (Bus. & Prof. Code § 17600 et seq., as amended by AB 2863.)
//
// ONE source for the words, imported by BOTH the billing page (which renders
// them) and the checkout / change-plan routes (which re-derive them and
// compare against what the browser says it showed, then store the exact text
// as proof). Not 'server-only' on purpose — the page needs it too.
//
// Changing ANY wording here means bumping AUTO_RENEWAL_CONSENT_VERSION, so a
// stored consent row can always be matched to the words the person agreed to.
// A browser holding an older version is refused and told to reload.
//
// Monthly only. Annual billing stays off and has no consent text; the routes
// refuse interval 'year' until one is written.
//
// Prices come from the pricing catalog (cents), which the routes also verify
// against the live Stripe Price before anything is charged.

export const AUTO_RENEWAL_CONSENT_VERSION = 'ca-arl-2026-11-v1'

/** new = first subscription (Checkout); upgrade / downgrade = change-plan. */
export type ConsentKind = 'new' | 'upgrade' | 'downgrade'

const TIER_RANK: Record<PricingTier, number> = { starter: 1, pro: 2 }

/** Moving to a higher tier — or from an unrecognized price — charges now. */
export function isUpgrade(from: PricingTier | null, to: PricingTier): boolean {
  return from === null || TIER_RANK[to] > TIER_RANK[from]
}

export function changeKind(from: PricingTier | null, to: PricingTier): ConsentKind {
  return isUpgrade(from, to) ? 'upgrade' : 'downgrade'
}

const CANCEL_LINE =
  'Cancel anytime online: use Manage Subscription on this page. Cancellation takes effect at the end of the period you have already paid for. Under our Terms, all fees are non-refundable, including for partial months, except as required by law.'

/** The plain-text disclosure shown directly above the button. */
export function autoRenewalDisclosure(tier: PricingTier, kind: ConsentKind): string[] {
  const { displayName, priceCents } = pricingTierConfig(tier)
  const price = dollars(priceCents)

  if (kind === 'new') {
    return [
      `${displayName} plan: ${price} per month.`,
      `Your subscription renews automatically every month until you cancel. Your card is charged ${price} today and then ${price} each month on your renewal date.`,
      CANCEL_LINE,
    ]
  }
  if (kind === 'upgrade') {
    return [
      `Switching to ${displayName}: ${price} per month.`,
      `Today your card is charged the prorated difference between your current plan and ${displayName} for the rest of this billing period. Your subscription then renews automatically every month until you cancel, and your card is charged ${price} each month on your renewal date. Your renewal date does not change.`,
      CANCEL_LINE,
    ]
  }
  return [
    `Switching to ${displayName}: ${price} per month.`,
    `Your plan changes right away, and the unused time on your current plan is credited to your next invoice. Your subscription renews automatically every month until you cancel, and your card is charged ${price} each month on your renewal date. Your renewal date does not change.`,
    CANCEL_LINE,
  ]
}

/** The checkbox label. Separate from any Terms/Privacy checkbox. */
export function autoRenewalCheckboxLabel(tier: PricingTier): string {
  const { displayName, priceCents } = pricingTierConfig(tier)
  return `I agree that my ${displayName} subscription will renew automatically each month at ${dollars(priceCents)} until I cancel, and I authorize theQRealtor to charge my card each month. I can cancel anytime in Manage Subscription.`
}

/** Everything the person saw and ticked, as one string — stored verbatim. */
export function autoRenewalConsentText(tier: PricingTier, kind: ConsentKind): string {
  return [...autoRenewalDisclosure(tier, kind), '', `[x] ${autoRenewalCheckboxLabel(tier)}`].join('\n')
}

/** What the browser sends with a checkout / change-plan request. */
export interface AutoRenewalConsentPayload {
  consent: true
  consentVersion: string
  consentText: string
}

export function consentPayload(tier: PricingTier, kind: ConsentKind): AutoRenewalConsentPayload {
  return { consent: true, consentVersion: AUTO_RENEWAL_CONSENT_VERSION, consentText: autoRenewalConsentText(tier, kind) }
}
