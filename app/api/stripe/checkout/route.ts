import { NextResponse } from 'next/server'
import { getStripe } from '../../../../lib/stripe'
import { createServerSupabase } from '../../../../lib/supabase-server'

export async function POST(request: Request) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { plan } = await request.json().catch(() => ({ plan: 'monthly' }))
  const priceId = plan === 'yearly'
    ? process.env.STRIPE_PRICE_ID_YEARLY
    : process.env.STRIPE_PRICE_ID_MONTHLY

  if (!priceId) {
    const varName = plan === 'yearly' ? 'STRIPE_PRICE_ID_YEARLY' : 'STRIPE_PRICE_ID_MONTHLY'
    console.error(`[checkout] Missing env var: ${varName}`)
    return NextResponse.json({ error: `Server misconfiguration: ${varName} is not set.` }, { status: 500 })
  }

  if (!priceId.startsWith('price_')) {
    console.error(`[checkout] Invalid price ID format: "${priceId}"`)
    return NextResponse.json({ error: `Invalid price ID "${priceId}" — must start with "price_".` }, { status: 500 })
  }

  const origin = request.headers.get('origin') || 'https://realtqr.vercel.app'

  try {
    const session = await getStripe().checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/dashboard?upgraded=1`,
      cancel_url: `${origin}/dashboard/billing`,
      customer_email: user.email,
      metadata: { userId: user.id },
    })
    return NextResponse.json({ url: session.url })
  } catch (err: any) {
    console.error('[checkout] Stripe error:', err?.message)
    return NextResponse.json({ error: err?.message ?? 'Stripe checkout failed.' }, { status: 500 })
  }
}
