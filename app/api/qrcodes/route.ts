import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { getBetaStatus } from '@/lib/beta'

// ─── rate limiter ─────────────────────────────────────────────────────────────
// Best-effort in-memory window per IP. Works for single-instance deployments;
// for multi-instance (e.g. many Vercel regions) use Redis instead.
// QR generation itself is uncapped by plan — this stops a scripted flood
// from one account, not normal creation of a handful of codes in one sitting.
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

  const { data: profile } = await supabase
    .from('profiles')
    .select('beta_joined_at')
    .eq('id', user.id)
    .single()

  const { expired } = getBetaStatus(profile?.beta_joined_at)
  if (expired) {
    return NextResponse.json({ error: 'Your beta has ended.' }, { status: 403 })
  }

  const { property_id, label, placement, type, scan_count } = await req.json()

  // Verify the property belongs to this user
  const { data: prop } = await supabase
    .from('properties')
    .select('id')
    .eq('id', property_id)
    .eq('user_id', user.id)
    .single()

  if (!prop) {
    return NextResponse.json({ error: 'Property not found.' }, { status: 404 })
  }

  const { data, error } = await supabase
    .from('qrcodes')
    .insert({ property_id, label, placement, type, scan_count: scan_count ?? 0 })
    .select()
    .single()

  if (error || !data) {
    return NextResponse.json({ error: error?.message || 'Failed to create QR code.' }, { status: 500 })
  }

  return NextResponse.json(data)
}
