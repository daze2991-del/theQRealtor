import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { createAdminSupabase } from '@/lib/supabase-admin'

// Per-plan sign limits. 'founding' is the beta plan. null = unlimited.
const SIGN_LIMITS: Record<string, number | null> = {
  founding: 10,
  alpha:    10,
  free:     1,
  starter:  3,
  pro:      10,
  elite:    null,
}

export async function POST(req: Request) {
  const supabase = createServerSupabase()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { label?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const label = typeof body.label === 'string' ? body.label.trim() : ''
  if (!label) {
    return NextResponse.json({ error: 'Please enter a sign label.' }, { status: 400 })
  }

  const admin = createAdminSupabase()

  // Missing profile row → treat as free plan rather than failing.
  const { data: profile } = await admin
    .from('profiles')
    .select('plan')
    .eq('id', user.id)
    .maybeSingle()

  const plan = typeof profile?.plan === 'string' ? profile.plan : 'free'
  const limit = plan in SIGN_LIMITS ? SIGN_LIMITS[plan] : SIGN_LIMITS.free

  if (limit !== null) {
    const { count, error: countError } = await admin
      .from('signs')
      .select('id', { count: 'exact', head: true })
      .eq('agent_id', user.id)
    if (countError) {
      console.error('[signs/create] count error:', countError)
      return NextResponse.json({ error: 'Failed to create sign. Please try again.' }, { status: 500 })
    }
    if ((count ?? 0) >= limit) {
      return NextResponse.json(
        { error: `Your plan allows up to ${limit} sign${limit === 1 ? '' : 's'}. Upgrade to add more.` },
        { status: 403 }
      )
    }
  }

  const { data: sign, error: insertError } = await admin
    .from('signs')
    .insert({ agent_id: user.id, label })
    .select('id, label, created_at')
    .single()

  if (insertError || !sign) {
    console.error('[signs/create] insert error:', insertError)
    return NextResponse.json({ error: 'Failed to create sign. Please try again.' }, { status: 500 })
  }

  return NextResponse.json({ sign })
}
