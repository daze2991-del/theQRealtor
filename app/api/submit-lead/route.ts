import { NextResponse } from 'next/server'
import twilio from 'twilio'
import { createAdminSupabase } from '../../../lib/supabase-admin'

// ─── rate limiter ─────────────────────────────────────────────────────────────
// Best-effort in-memory window per IP. Works for single-instance deployments;
// for multi-instance (e.g. many Vercel regions) use Redis instead.
const rateMap = new Map<string, number[]>()
const LIMIT = 5
const WINDOW_MS = 60_000

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const hits = (rateMap.get(ip) ?? []).filter(t => now - t < WINDOW_MS)
  if (hits.length >= LIMIT) return true
  hits.push(now)
  rateMap.set(ip, hits)
  return false
}

const MOTIVATION_LABELS: Record<string, string> = {
  cold:      'Just browsing',
  warm:      'Casually looking',
  motivated: 'Actively searching',
  hot:       'Ready to make an offer',
}

export async function POST(request: Request) {
  // ── rate limit ──────────────────────────────────────────────────────────────
  const ip = (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown'
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: 'Too many submissions. Please wait a minute.' }, { status: 429 })
  }

  // ── parse & validate body ───────────────────────────────────────────────────
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const { propertyId, qrId, name, phone, email, motivation } = body as Record<string, string | null | undefined>

  // 'cold' (Save Property) only requires email — name/phone are optional
  const isSaveOnly = motivation === 'cold'
  if (!propertyId || !email?.trim() || !motivation) {
    return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 })
  }
  if (!isSaveOnly && (!name?.trim() || !phone?.trim())) {
    return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 })
  }

  const supabase = createAdminSupabase()

  // ── fetch property — validate it exists, is active, and get agent_phone ─────
  // agent_phone comes from the DB only; the client never supplies it.
  const { data: property, error: propError } = await supabase
    .from('properties')
    .select('id, address, agent_phone, active, user_id')
    .eq('id', propertyId)
    .single()

  if (propError || !property || !property.active) {
    return NextResponse.json({ error: 'Property not found.' }, { status: 404 })
  }

  // ── insert lead ─────────────────────────────────────────────────────────────
  const { error: insertError } = await supabase.from('leads').insert({
    property_id: propertyId,
    qr_id:       qrId || null,
    name:        name?.trim() || 'Not provided',
    phone:       phone?.trim() || '',
    email:       email?.trim() || '',
    motivation,
    agent_id:    property.user_id || null,
  })

  if (insertError) {
    console.error('[submit-lead] insert error:', insertError)
    return NextResponse.json({ error: 'Failed to save your info. Please try again.' }, { status: 500 })
  }

  // ── SMS alert — uses server-fetched agent_phone, never client input ─────────
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken  = process.env.TWILIO_AUTH_TOKEN
  const from       = process.env.TWILIO_PHONE_NUMBER

  console.log('[submit-lead] SMS check — agent_phone:', property.agent_phone ?? '(null)',
    '| TWILIO_ACCOUNT_SID present:', !!accountSid,
    '| TWILIO_AUTH_TOKEN present:', !!authToken,
    '| TWILIO_PHONE_NUMBER present:', !!from,
    '| TWILIO_PHONE_NUMBER value:', from ?? '(missing)')

  if (property.agent_phone) {
    if (accountSid && authToken && from) {
      console.log('[submit-lead] calling Twilio messages.create to:', property.agent_phone)
      try {
        const msg = await twilio(accountSid, authToken).messages.create({
          to:   property.agent_phone,
          from,
          body: `New lead from ${(name || 'Unknown').trim()} for ${property.address}. Phone: ${phone?.trim() || 'not provided'}. Intent: ${MOTIVATION_LABELS[motivation] ?? motivation}. Log in to RealtQR to view.`,
        })
        console.log('[submit-lead] SMS sent OK — sid:', msg.sid, '| status:', msg.status)
      } catch (smsErr: any) {
        // SMS failure must not block the success response — lead is already saved.
        console.error('[submit-lead] SMS error — code:', smsErr?.code,
          '| message:', smsErr?.message,
          '| status:', smsErr?.status,
          '| moreInfo:', smsErr?.moreInfo)
      }
    } else {
      console.warn('[submit-lead] SMS skipped — missing Twilio env vars')
    }
  } else {
    console.log('[submit-lead] SMS skipped — no agent_phone on property')
  }

  return NextResponse.json({ ok: true })
}
