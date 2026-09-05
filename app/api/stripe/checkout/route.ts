import { NextResponse } from 'next/server'
import { getStripe } from '../../../../lib/stripe'
import { createServerSupabase } from '../../../../lib/supabase-server'
import { createAdminSupabase } from '../../../../lib/supabase-admin'
import { isPricingTier, resolvePriceId, type BillingInterval } from '../../../../lib/pricing'

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
  if (interval === 'year' && process.env.ANNUAL_BILLING_ENABLED !== 'true') {
    return NextResponse.json({ error: 'Annual billing is not yet available.' }, { status: 403 })
  }

  // ── 6. Resolve the Price ID ──────────────────────────────────────────────────
  // No fallback and no default tier — a missing/empty env var is a
  // configuration error, not something to paper over with another price.
  const priceId = resolvePriceId(tier, interval)
  if (!priceId) {
    const varName = tier === 'starter'
      ? (interval === 'year' ? 'STRIPE_PRICE_ID_STARTER_YEARLY' : 'STRIPE_PRICE_ID_STARTER_MONTHLY')
      : (interval === 'year' ? 'STRIPE_PRICE_ID_PRO_YEARLY' : 'STRIPE_PRICE_ID_PRO_MONTHLY')
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
  const { data: profile } = await admin
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', agentId)
    .maybeSingle()
  const existingCustomerId = profile?.stripe_customer_id || null

  const origin = request.headers.get('origin') || 'https://realtqr.vercel.app'

  // TODO(ARL): California's Automatic Renewal Law requires an affirmative
  // consent checkbox (and logged proof of consent — timestamp, IP, exact
  // text shown) immediately before a subscription with auto-renewal is
  // created. That checkbox and its consent-logging plug in here, before the
  // Checkout Session below is created. Not implemented — pending legal
  // review, see lib/billing.ts and the Stripe webhook's deferred-list comment.

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
    })
    return NextResponse.json({ url: session.url })
  } catch (err: any) {
    console.error('[checkout] Stripe error:', err?.message)
    return NextResponse.json({ error: err?.message ?? 'Stripe checkout failed.' }, { status: 500 })
  }
}
