import { NextResponse } from 'next/server'
import { getStripe } from '../../../../lib/stripe'
import { createServerSupabase } from '../../../../lib/supabase-server'

export const runtime = 'nodejs'

const FRIENDLY_ERROR = 'We couldn\'t open the billing portal right now. Please try again in a moment.'

export async function POST(request: Request) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const STRIPE_CHARGES_ENABLED = process.env.STRIPE_CHARGES_ENABLED === 'true'
  if (!STRIPE_CHARGES_ENABLED) {
    return NextResponse.json({ error: 'Paid plans not yet available' }, { status: 403 })
  }

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
