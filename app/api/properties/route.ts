import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { createAdminSupabase } from '@/lib/supabase-admin'
import { getBetaStatus } from '@/lib/beta'
import { propertyLimitForPlan } from '@/lib/plans'

// The single server-side creation point for properties. app/dashboard/onboarding
// posts here too rather than inserting directly, so the limit below cannot be
// walked around by starting from onboarding.
export async function POST(req: Request) {
  const supabase = createServerSupabase()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('beta_joined_at, plan')
    .eq('id', user.id)
    .single()

  const { expired } = getBetaStatus(profile?.beta_joined_at)
  if (expired) {
    return NextResponse.json({ error: 'Your beta has ended.', betaExpired: true }, { status: 403 })
  }

  // ── Per-plan listing limit ──────────────────────────────────────────────────
  // Counts ACTIVE listings only — not-deleted AND active=true — matching the
  // client pre-check in new-property/page.tsx and the marketing copy's "up to
  // N active listings at a time." Toggling a listing inactive frees a slot
  // immediately, without deleting it. Grandfathered plans (founding/alpha) and
  // pro return null here and skip the check entirely.
  //
  // Counted with the admin client so the number is the true row count rather
  // than whatever the caller's RLS view happens to expose.
  const plan = typeof profile?.plan === 'string' ? profile.plan : 'free'
  const limit = propertyLimitForPlan(plan)

  if (limit !== null) {
    const admin = createAdminSupabase()
    const { count, error: countError } = await admin
      .from('properties')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('active', true)
      .is('deleted_at', null)
    if (countError) {
      console.error('[properties] count error:', countError)
      return NextResponse.json({ error: 'Failed to create property. Please try again.' }, { status: 500 })
    }
    if ((count ?? 0) >= limit) {
      return NextResponse.json(
        {
          error: `Your plan allows up to ${limit} listing${limit === 1 ? '' : 's'}. Upgrade to add more.`,
          limitReached: true,
          limit,
          plan,
        },
        { status: 403 }
      )
    }
  }

  const { address, agent_name, agent_phone, city, state, price, beds, baths, description } = await req.json()

  const { data, error } = await supabase
    .from('properties')
    .insert({
      address,
      agent_name,
      agent_phone: agent_phone || null,
      city,
      state,
      price: price ? Number(price) : null,
      beds: beds ? Number(beds) : null,
      baths: baths ? Number(baths) : null,
      description,
      user_id: user.id,
      active: true,
    })
    .select('id')
    .single()

  if (error || !data) {
    return NextResponse.json({ error: error?.message || 'Failed to create property.' }, { status: 500 })
  }

  return NextResponse.json({ id: data.id })
}
