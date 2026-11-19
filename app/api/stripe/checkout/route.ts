import { NextResponse } from 'next/server'
import { getStripe } from '../../../../lib/stripe'
import { createServerSupabase } from '../../../../lib/supabase-server'
import { createAdminSupabase } from '../../../../lib/supabase-admin'
import { isPricingTier, resolvePriceId, type BillingInterval } from '../../../../lib/pricing'
import { findBlockingSubscription } from '../../../../lib/stripeSync'
import { checkConsentText, recordConsent, requireConsentFlag, verifyStripePrice } from '../../../../lib/autoRenewalConsent'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  // ── 1. PAID_PLANS_ENABLED ───────────────────────────────────────────────────
  // Read at request time, not module load — flipping this in the environment
  // must take effect without a redeploy.
  if (process.env.PAID_PLANS_ENABLED !== 'true') {
    return NextResponse.json({ error: 'Paid plans not yet available.' }, { status: 503 })
  }

  // ── 2. STRIPE_CHARGES_ENABLED ────────────────────────────────────────────────
  if (process.env.STRIPE_CHARGES_ENABLED !== 'true') {
    return NextResponse.json({ error: 'Paid plans not yet available.' }, { status: 503 })
  }

  // ── 3. Auth ──────────────────────────────────────────────────────────────────
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const agentId = user.id

  // ── 4. Tier ──────────────────────────────────────────────────────────────────
  // The client sends a tier key only — never a Stripe Price ID. Anything not in
  // the catalog (including a raw price ID smuggled into this field) is rejected.
  const body = await request.json().catch(() => null)
  const tier = body?.tier
  if (!isPricingTier(tier)) {
    return NextResponse.json({ error: 'Invalid or missing tier.' }, { status: 400 })
  }

  // ── 5. Interval ──────────────────────────────────────────────────────────────
  const interval = body?.interval as BillingInterval | undefined
  if (interval !== 'month' && interval !== 'year') {
    return NextResponse.json({ error: 'Invalid or missing interval.' }, { status: 400 })
  }
  // Annual stays off no matter what ANNUAL_BILLING_ENABLED says: there is no
  // annual auto-renewal consent wording yet (lib/autoRenewal.ts is monthly
  // only), and a subscription must never start without the right consent.
  if (interval === 'year') {
    return NextResponse.json({ error: 'Annual billing is not yet available.' }, { status: 403 })
  }

  // ── 5b. Auto-renewal consent (California ARL) ────────────────────────────────
  // Refuse before any Stripe or database work unless the request carries the
  // consent flag and the exact text this server would show.
  const noConsent = requireConsentFlag(body)
  if (noConsent) return NextResponse.json(noConsent.body, { status: noConsent.status })
  const consent = checkConsentText(body, tier, 'new')
  if (!consent.ok) return NextResponse.json(consent.refusal.body, { status: consent.refusal.status })

  // ── 6. Resolve the Price ID ──────────────────────────────────────────────────
  // No fallback and no default tier — a missing/empty env var is a
  // configuration error, not something to paper over with another price.
  const priceId = resolvePriceId(tier, interval)
  if (!priceId) {
    const varName = tier === 'starter' ? 'STRIPE_PRICE_ID_STARTER_MONTHLY' : 'STRIPE_PRICE_ID_PRO_MONTHLY'
    console.error(`[checkout] Missing env var: ${varName}`)
    return NextResponse.json({ error: `Server misconfiguration: ${varName} is not set.` }, { status: 500 })
  }
  if (!priceId.startsWith('price_')) {
    console.error(`[checkout] Invalid price ID format: "${priceId}"`)
    return NextResponse.json({ error: `Invalid price ID "${priceId}" — must start with "price_".` }, { status: 500 })
  }

  // ── 7. Reuse an existing Stripe customer if one is already on file ─────────
  // An upgrade (e.g. Starter -> Pro) must never create a second customer or a
  // parallel account. Read with the admin client so this reflects the true row
  // regardless of RLS.
  const admin = createAdminSupabase()
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('stripe_customer_id, stripe_subscription_id')
    .eq('id', agentId)
    .maybeSingle()
  if (profileError) {
    console.error('[checkout] profile read failed:', profileError.message)
    return NextResponse.json({ error: 'Could not start checkout. Please try again.' }, { status: 500 })
  }
  const existingCustomerId = profile?.stripe_customer_id || null

  // ── 8. Never a second subscription ─────────────────────────────────────────
  // An agent with any subscription that is not canceled/incomplete_expired
  // changes tier through /api/stripe/change-plan (one subscription, prorated)
  // — a second Checkout would double-charge. Checked against Stripe, and
  // fails closed if Stripe can't be reached.
  try {
    const blocking = await findBlockingSubscription(
      getStripe(), existingCustomerId, profile?.stripe_subscription_id || null,
    )
    if (blocking) {
      return NextResponse.json({
        error: 'You already have a subscription. Use "Switch plan" or Manage Subscription to change it.',
        code: 'existing_subscription',
      }, { status: 409 })
    }
  } catch (err: any) {
    console.error('[checkout] existing-subscription check failed:', err?.message)
    return NextResponse.json({ error: 'Could not start checkout. Please try again.' }, { status: 502 })
  }

  const origin = request.headers.get('origin') || 'https://realtqr.vercel.app'

  // ── 9. The disclosed price must be the price Stripe will charge ──────────────
  try {
    if (!(await verifyStripePrice(getStripe(), priceId, tier))) {
      return NextResponse.json({ error: 'This plan is temporarily unavailable. Please contact support.' }, { status: 500 })
    }
  } catch (err: any) {
    console.error('[checkout] price verification failed:', err?.message)
    return NextResponse.json({ error: 'Could not start checkout. Please try again.' }, { status: 502 })
  }

  // ── 10. Store proof of consent BEFORE the Checkout Session exists ────────────
  // No row, no session: if this fails nothing is created and nothing is charged.
  if (!(await recordConsent(admin, { userId: agentId, tier, text: consent.text, request }))) {
    return NextResponse.json({ error: 'Could not start checkout. Please try again.' }, { status: 500 })
  }

  try {
    const session = await getStripe().checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/dashboard?upgraded=1`,
      cancel_url: `${origin}/dashboard/billing`,
      ...(existingCustomerId
        ? { customer: existingCustomerId }
        : { customer_email: user.email }),
      client_reference_id: agentId,
      metadata: { agent_id: agentId, tier },
      // Lets customer.subscription.* events find the agent even if they
      // arrive before checkout.session.completed. Attribution only — the
      // plan always comes from the price ID, never from this metadata.
      subscription_data: { metadata: { agent_id: agentId } },
    })
    return NextResponse.json({ url: session.url })
  } catch (err: any) {
    console.error('[checkout] Stripe error:', err?.message)
    return NextResponse.json({ error: err?.message ?? 'Stripe checkout failed.' }, { status: 500 })
  }
}
