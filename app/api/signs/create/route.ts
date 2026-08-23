import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { createAdminSupabase } from '@/lib/supabase-admin'
import { signLimitForPlan } from '@/lib/plans'

// ─── rate limiter ─────────────────────────────────────────────────────────────
// Best-effort in-memory window per IP. Works for single-instance deployments;
// for multi-instance (e.g. many Vercel regions) use Redis instead.
// Stops a scripted flood from one account — separate from, and in addition
// to, the per-plan SIGN_LIMITS cap above.
const rateMap = new Map<string, number[]>()
const LIMIT = 10
const WINDOW_MS = 60_000

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const hits = (rateMap.get(ip) ?? []).filter(t => now - t < WINDOW_MS)
  if (hits.length >= LIMIT) return true
  hits.push(now)
  rateMap.set(ip, hits)
  return false
}

export async function POST(req: Request) {
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown'
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: 'Too many requests. Please wait a minute.' }, { status: 429 })
  }

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
  const limit = signLimitForPlan(plan)

  if (limit !== null) {
    // Only ACTIVE signs count. Archived signs (archived_at set) are retired
    // inventory — they keep their history and their buyer page keeps resolving,
    // they just no longer consume a plan slot.
    const { count, error: countError } = await admin
      .from('signs')
      .select('id', { count: 'exact', head: true })
      .eq('agent_id', user.id)
      .is('archived_at', null)
    if (countError) {
      console.error('[signs/create] count error:', countError)
      return NextResponse.json({ error: 'Failed to create sign. Please try again.' }, { status: 500 })
    }
    if ((count ?? 0) >= limit) {
      return NextResponse.json(
        {
          error: `You've reached your active sign limit (${limit}) — archive an old sign or upgrade to Pro.`,
          limitReached: true,
          limit,
        },
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
