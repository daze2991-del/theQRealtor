import { NextResponse } from 'next/server'
import { getStripe } from '../../../../lib/stripe'
import { createServerSupabase } from '../../../../lib/supabase-server'

export async function GET() {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_subscription_id')
    .eq('id', user.id)
    .single()

  if (!profile?.stripe_subscription_id) {
    return NextResponse.json({ subscription: null })
  }

  const sub = await getStripe().subscriptions.retrieve(profile.stripe_subscription_id)
  const item = sub.items.data[0]

  return NextResponse.json({
    subscription: {
      status: sub.status,
      current_period_end: item?.current_period_end ?? null,
      cancel_at_period_end: sub.cancel_at_period_end,
      interval: item?.plan?.interval ?? 'month',
    },
  })
}
