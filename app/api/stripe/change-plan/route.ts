import { NextResponse } from 'next/server'
import { getStripe } from '../../../../lib/stripe'
import { createServerSupabase } from '../../../../lib/supabase-server'
import { createAdminSupabase } from '../../../../lib/supabase-admin'
import { billingAutomationEnabled } from '../../../../lib/billing'
import { isPricingTier, planForPriceId, resolvePriceId, type PricingTier } from '../../../../lib/pricing'
import { ENTITLED_STATUSES, syncSubscription } from '../../../../lib/stripeSync'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ── Starter ↔ Pro on the agent's EXISTING subscription ──────────────────────
//
// Swaps the subscription's single item to the other tier's price, prorated:
// an upgrade invoices and charges the difference immediately and only takes
// effect if that payment succeeds; a downgrade credits the next invoice.
// Never creates a subscription (that is /api/stripe/checkout, which refuses
// when one already exists), so an upgrade can never double-charge.
//
// • Acts only on the signed-in agent's own subscription (from their profile,
//   never from the request).
// • The client sends a tier key; the Price ID is resolved here. A raw price ID
//   in the body is rejected like any other non-tier value.
// • Kill switches: PAID_PLANS_ENABLED and STRIPE_CHARGES_ENABLED (same as
//   checkout) AND BILLING_AUTOMATION_ENABLED — this modifies a subscription,
//   which lib/billing.ts forbids while automation is off.
// • The billing interval is kept as-is.
// • The plan is written by lib/stripeSync.ts from the updated subscription
//   (same path as the webhook, which will also confirm it).

const TIER_RANK: Record<PricingTier, number> = { starter: 1, pro: 2 }
/** Moving to a higher tier (or from an unrecognized price) charges now. */
function isUpgrade(from: PricingTier | null, to: PricingTier): boolean {
  return from === null || TIER_RANK[to] > TIER_RANK[from]
}

const UPGRADE_DECLINED = {
  error: 'Your payment didn\'t go through, so your plan hasn\'t changed. Update your card in Manage Subscription and try again.',
  code: 'upgrade_payment_failed',
} as const

export async function POST(request: Request) {
  if (process.env.PAID_PLANS_ENABLED !== 'true' || process.env.STRIPE_CHARGES_ENABLED !== 'true') {
    return NextResponse.json({ error: 'Paid plans not yet available.' }, { status: 503 })
  }
  if (!billingAutomationEnabled()) {
    return NextResponse.json({ error: 'Plan changes are not available yet.' }, { status: 503 })
  }

  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const tier = body?.tier
  if (!isPricingTier(tier)) {
    return NextResponse.json({ error: 'Invalid or missing tier.' }, { status: 400 })
  }

  const admin = createAdminSupabase()
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('plan, stripe_customer_id, stripe_subscription_id')
    .eq('id', user.id)
    .maybeSingle()
  if (profileError || !profile) {
    console.error('[change-plan] profile read failed:', profileError?.message)
    return NextResponse.json({ error: 'Could not change your plan. Please try again.' }, { status: 500 })
  }
  if (profile.plan === 'founding' || profile.plan === 'alpha') {
    return NextResponse.json({ error: 'Your plan is managed manually. Contact support to change it.' }, { status: 403 })
  }
  if (!profile.stripe_subscription_id) {
    return NextResponse.json({ error: 'No subscription to change.', code: 'no_subscription' }, { status: 409 })
  }

  const stripe = getStripe()
  try {
    const sub = await stripe.subscriptions.retrieve(profile.stripe_subscription_id)
    const subCustomer = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id
    if (!profile.stripe_customer_id || subCustomer !== profile.stripe_customer_id) {
      console.error(`[change-plan] subscription ${sub.id} customer ${subCustomer} does not match profile ${user.id}`)
      return NextResponse.json({ error: 'Could not change your plan. Please contact support.' }, { status: 409 })
    }
    if (!ENTITLED_STATUSES.includes(sub.status)) {
      return NextResponse.json({
        error: 'Your subscription isn\'t active. Update your payment method in Manage Subscription first.',
        code: 'subscription_not_active',
      }, { status: 409 })
    }
    if (sub.items.data.length !== 1) {
      console.error(`[change-plan] subscription ${sub.id} has ${sub.items.data.length} items — refusing`)
      return NextResponse.json({ error: 'Could not change your plan. Please contact support.' }, { status: 409 })
    }

    const item = sub.items.data[0]
    const currentTier = planForPriceId(item.price.id)
    if (currentTier === tier) {
      return NextResponse.json({ error: 'You\'re already on this plan.', code: 'same_plan' }, { status: 409 })
    }

    const interval = item.price.recurring?.interval === 'year' ? 'year' : 'month'
    if (interval === 'year' && process.env.ANNUAL_BILLING_ENABLED !== 'true') {
      return NextResponse.json({ error: 'Annual billing is not yet available.' }, { status: 403 })
    }
    const priceId = resolvePriceId(tier, interval)
    if (!priceId || !priceId.startsWith('price_')) {
      console.error(`[change-plan] no valid price configured for ${tier}/${interval}`)
      return NextResponse.json({ error: 'Could not change your plan. Please try again later.' }, { status: 500 })
    }

    if (isUpgrade(currentTier, tier)) {
      // Upgrade: invoice and charge the prorated difference NOW. With
      // pending_if_incomplete, Stripe applies the new price only if that
      // charge succeeds; otherwise the subscription keeps its current price
      // (the change waits in pending_update and expires). The webhook reads
      // the subscription's items, so the plan cannot become Pro unpaid.
      let updated
      try {
        updated = await stripe.subscriptions.update(sub.id, {
          items: [{ id: item.id, price: priceId }],
          proration_behavior: 'always_invoice',
          payment_behavior: 'pending_if_incomplete',
        })
      } catch (err: any) {
        if (err?.type === 'StripeCardError' || err?.statusCode === 402) {
          console.warn(`[change-plan] upgrade charge declined for ${sub.id}:`, err?.message)
          return NextResponse.json(UPGRADE_DECLINED, { status: 402 })
        }
        throw err
      }
      if (updated.pending_update) {
        console.warn(`[change-plan] upgrade charge not completed for ${sub.id} — change left pending, plan unchanged`)
        return NextResponse.json(UPGRADE_DECLINED, { status: 402 })
      }
    } else {
      // Downgrade: no charge now; the unused time is credited on the next invoice.
      await stripe.subscriptions.update(sub.id, {
        items: [{ id: item.id, price: priceId }],
        proration_behavior: 'create_prorations',
      })
    }
  } catch (err: any) {
    console.error('[change-plan] Stripe error:', err?.message)
    return NextResponse.json({ error: 'Could not change your plan. Please try again.' }, { status: 502 })
  }

  // Apply now so the agent sees it immediately; the webhook re-applies the
  // same values. A failure here is not the agent's problem — Stripe has the
  // change and the webhook will catch up.
  try {
    const result = await syncSubscription(admin, stripe, profile.stripe_subscription_id, { userId: user.id })
    if (result.outcome !== 'updated') console.warn('[change-plan] immediate sync:', result)
  } catch (err: any) {
    console.error('[change-plan] immediate sync failed (webhook will retry):', err?.message)
  }

  return NextResponse.json({ ok: true, tier })
}
