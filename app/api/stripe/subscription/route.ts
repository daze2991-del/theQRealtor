import { NextResponse } from 'next/server'
import { getStripe } from '../../../../lib/stripe'
import { createServerSupabase } from '../../../../lib/supabase-server'
import { planForPriceId } from '../../../../lib/pricing'
import { withErrorAlerts } from '../../../../lib/errorAlerts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// What the billing page needs to choose between Checkout, Switch plan and
// Manage Subscription. hasBillingAccount = a Stripe customer exists, which is
// what the portal requires.
async function GET__handler() {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_customer_id, stripe_subscription_id')
    .eq('id', user.id)
    .maybeSingle()

  const hasBillingAccount = !!profile?.stripe_customer_id

  if (!profile?.stripe_subscription_id) {
    return NextResponse.json({ subscription: null, hasBillingAccount })
  }

  try {
    const sub = await getStripe().subscriptions.retrieve(profile.stripe_subscription_id)
    const item = sub.items.data[0]
    return NextResponse.json({
      hasBillingAccount,
      subscription: {
        status: sub.status,
        current_period_end: item?.current_period_end ?? null,
        cancel_at_period_end: sub.cancel_at_period_end,
        interval: item?.plan?.interval ?? 'month',
        tier: planForPriceId(item?.price?.id),
      },
    })
  } catch (err: any) {
    console.error('[stripe/subscription] retrieve failed:', err?.message)
    return NextResponse.json({ subscription: null, hasBillingAccount, error: 'Could not load subscription details.' })
  }
}

export const GET = withErrorAlerts('/api/stripe/subscription', GET__handler)
