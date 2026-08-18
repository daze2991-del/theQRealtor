import { NextResponse } from 'next/server'
import { normalizePhone } from '../../../../../lib/phone'
import { startPhoneVerification } from '../../../../../lib/twilio'

// ─── rate limiter ─────────────────────────────────────────────────────────────
// Best-effort in-memory window per phone number. Works for single-instance
// deployments; for multi-instance (e.g. many Vercel regions) use Redis instead.
const rateMap = new Map<string, number[]>()
const LIMIT = 3
const WINDOW_MS = 60 * 60_000

function isRateLimited(key: string): boolean {
  const now = Date.now()
  const hits = (rateMap.get(key) ?? []).filter(t => now - t < WINDOW_MS)
  if (hits.length >= LIMIT) return true
  hits.push(now)
  rateMap.set(key, hits)
  return false
}

export async function POST(req: Request) {
  const { phone } = await req.json()

  if (!phone || typeof phone !== 'string' || !phone.trim()) {
    return NextResponse.json({ error: 'A phone number is required.' }, { status: 400 })
  }
  const normalizedPhone = normalizePhone(phone)
  if (!normalizedPhone) {
    return NextResponse.json({ error: 'Please enter a valid phone number.' }, { status: 400 })
  }

  if (isRateLimited(normalizedPhone)) {
    return NextResponse.json(
      { error: 'Too many code requests for this number. Please try again later.' },
      { status: 429 }
    )
  }

  const result = await startPhoneVerification(normalizedPhone)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 })
  }

  return NextResponse.json({ ok: true })
}
