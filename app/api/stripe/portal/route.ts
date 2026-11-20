import { NextResponse } from 'next/server'
import { getStripe } from '../../../../lib/stripe'
import { createServerSupabase } from '../../../../lib/supabase-server'
import { withErrorAlerts } from '../../../../lib/errorAlerts'

export const runtime = 'nodejs'

const FRIENDLY_ERROR = 'We couldn\'t open the billing portal right now. Please try again in a moment.'

async function POST__handler(request: Request) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Deliberately NOT behind STRIPE_CHARGES_ENABLED / PAID_PLANS_ENABLED /
  // BILLING_AUTOMATION_ENABLED. Cancelling online must always work for anyone
  // who has a Stripe customer (California's Automatic Renewal Law), even if
  // the purchase switches are turned off while subscriptions exist. The portal
  // creates no charge and no subscription; new purchases and plan changes stay
  // behind the switches in /api/stripe/checkout and /api/stripe/change-plan.
  // The only gate here is the one below: no Stripe customer, no portal.

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError) {
    console.error('[portal] profile read failed:', profileError.message)
    return NextResponse.json({ error: FRIENDLY_ERROR }, { status: 500 })
  }
  if (!profile?.stripe_customer_id) {
    return NextResponse.json({ error: 'There\'s no billing account on file yet. Choose a plan to get started.' }, { status: 400 })
  }

  const origin = request.headers.get('origin') || 'https://realtqr.vercel.app'

  try {
    const session = await getStripe().billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${origin}/dashboard/billing`,
    })
    return NextResponse.json({ url: session.url })
  } catch (err: any) {
    console.error('[portal] Stripe error:', err?.message)
    return NextResponse.json({ error: FRIENDLY_ERROR }, { status: 502 })
  }
}

export const POST = withErrorAlerts('/api/stripe/portal', POST__handler)
