import { NextResponse } from 'next/server'
import { createAdminSupabase } from '../../../lib/supabase-admin'

// ─── rate limiter ─────────────────────────────────────────────────────────────
// Best-effort in-memory window per IP. Works for single-instance deployments;
// for multi-instance (e.g. many Vercel regions) use Redis instead.
// Higher than submit-lead's 5/min since this fires on every page visit (a real
// agent testing sign placement might scan several times in quick succession),
// not just on a completed lead form — still low enough to blunt a flood.
const rateMap = new Map<string, number[]>()
const LIMIT = 20
const WINDOW_MS = 60_000

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const hits = (rateMap.get(ip) ?? []).filter(t => now - t < WINDOW_MS)
  if (hits.length >= LIMIT) return true
  hits.push(now)
  rateMap.set(ip, hits)
  return false
}

// Public, unauthenticated by design — buyers scanning a sign never have an
// account. Rate limiting plus routing every write through this server-side
// checkpoint (instead of a client-facing INSERT policy — see migration 035)
// is the actual protection here.
export async function POST(request: Request) {
  const ip = (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown'
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: 'Too many requests.' }, { status: 429 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const { property_id, qr_id, sign_id, return_visit, days_since_first_visit } = body

  if (!property_id || typeof property_id !== 'string') {
    return NextResponse.json({ error: 'property_id is required.' }, { status: 400 })
  }

  const scanRow: Record<string, unknown> = {
    property_id,
    return_visit: return_visit === true,
    days_since_first_visit: typeof days_since_first_visit === 'number' ? days_since_first_visit : null,
  }
  if (typeof qr_id === 'string' && qr_id) scanRow.qr_id = qr_id
  if (typeof sign_id === 'string' && sign_id) scanRow.sign_id = sign_id

  const { data, error } = await createAdminSupabase()
    .from('scan_events')
    .insert(scanRow)
    .select('id')
    .single()

  if (error || !data) {
    console.error('[scan-events] insert error:', error?.message)
    // Scan tracking must never break the buyer-facing page — respond 200
    // with no id rather than surfacing an error to the client.
    return NextResponse.json({ id: null })
  }

  return NextResponse.json({ id: data.id })
}
