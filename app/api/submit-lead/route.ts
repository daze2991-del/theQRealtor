import { NextResponse } from 'next/server'
import twilio from 'twilio'
import { createAdminSupabase } from '../../../lib/supabase-admin'
import { computeIntent, type EngagementData } from '../../../lib/leadScoring'

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

  const { propertyId, qrId, name, phone, email, motivation, questionText, contactPreference, scanEventId, engagement } =
    body as Record<string, unknown>

  const ctaMotivation = motivation as string | undefined

  if (!propertyId || !(name as string)?.trim() || !(email as string)?.trim() || !ctaMotivation) {
    return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 })
  }
  // phone required for both CTAs (showing + contact-the-agent)
  if (!(phone as string)?.trim()) {
    return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 })
  }

  // Compute intent score from engagement data sent by the buyer page
  const eng = engagement as (EngagementData & { visitCount?: number; returnVisit?: boolean }) | undefined
  const computedMotivation = eng
    ? computeIntent({
        // visitCount preferred; fall back to old returnVisit boolean for deploys in flight
        visitCount:    typeof eng.visitCount === 'number' ? eng.visitCount : (eng.returnVisit ? 2 : 1),
        photosViewed:  typeof eng.photosViewed  === 'number' ? eng.photosViewed  : 0,
        ctaClicked:    eng.ctaClicked ?? null,
        timeOnPageSec: typeof eng.timeOnPageSec === 'number' ? eng.timeOnPageSec : 0,
      })
    : ctaMotivation

  const supabase = createAdminSupabase()

  // ── fetch property — validate it exists, is active, and get agent_phone ─────
  // agent_phone comes from the DB only; the client never supplies it.
  const { data: property, error: propError } = await supabase
    .from('properties')
    .select('id, address, agent_phone, active, user_id')
    .eq('id', propertyId)
    .single()

  console.log('[submit-lead] propertyId received:', propertyId)
  console.log('[submit-lead] propError:', propError?.message ?? 'none')
  console.log('[submit-lead] property found:', !!property, '| active:', property?.active ?? '(null)')

  if (propError || !property || !property.active) {
    return NextResponse.json({ error: 'Property not found.' }, { status: 404 })
  }

  // ── insert lead ─────────────────────────────────────────────────────────────
  const { error: insertError } = await supabase.from('leads').insert({
    property_id:        propertyId,
    qr_id:              (qrId as string) || null,
    name:               (name as string).trim(),
    phone:              (phone as string)?.trim() || '',
    email:              (email as string).trim(),
    motivation:         computedMotivation,
    notes:              (questionText as string)?.trim() || null,
    contact_preference: (contactPreference as string)?.trim() || null,
    agent_id:           property.user_id || null,
  })

  if (insertError) {
    console.error('[submit-lead] insert error:', insertError)
    return NextResponse.json({ error: 'Failed to save your info. Please try again.' }, { status: 500 })
  }

  // ── mark scan_event as converted ────────────────────────────────────────────
  if (scanEventId) {
    await supabase.from('scan_events').update({
      cta_clicked:      eng?.ctaClicked    ?? null,
      time_on_page_sec: eng?.timeOnPageSec ?? null,
      photos_viewed:    eng?.photosViewed  ?? null,
      return_visit:     (eng?.visitCount ?? 0) > 1 || !!eng?.returnVisit,
      days_since_first_visit: (eng as any)?.daysSinceFirstVisit ?? null,
      converted:        true,
    }).eq('id', scanEventId)
  }

  // ── SMS alert (hot leads or showing requests) ────────────────────────────────
  // Fires when: motivation === 'hot' OR ctaClicked === 'showing'.
  // A showing click scores 11 pts → 'motivated' (below the 18-pt 'hot' threshold),
  // but requesting a showing is a time-sensitive signal agents need to act on immediately.
  // Gate: agent must have a phone saved AND sms_enabled === true in user_metadata.

  // ── debug: motivation & agent SMS settings ──────────────────────────────────
  console.log('[submit-lead] computedMotivation:', computedMotivation, '| raw ctaMotivation:', ctaMotivation)
  console.log('[submit-lead] eng.ctaClicked:', eng?.ctaClicked ?? '(no engagement data)')

  // Fetch agent sms_enabled from user_metadata (separate from agent_phone)
  let agentSmsEnabled: boolean | null = null
  if (property.user_id) {
    const { data: agentAuthData } = await supabase.auth.admin.getUserById(property.user_id)
    agentSmsEnabled = agentAuthData?.user?.user_metadata?.sms_enabled !== false
  }
  console.log('[submit-lead] agent sms_alerts_enabled (user_metadata):', agentSmsEnabled)
  console.log('[submit-lead] agent_phone (SMS target):', property.agent_phone ?? '(none)')

  const shouldSendSms = (computedMotivation === 'hot' || eng?.ctaClicked === 'showing')
    && !!property.agent_phone
    && agentSmsEnabled === true
  console.log('[submit-lead] SMS will attempt:', shouldSendSms,
    '| motivation:', computedMotivation, '| ctaClicked:', eng?.ctaClicked ?? 'none')

  if (shouldSendSms) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID
    const authToken  = process.env.TWILIO_AUTH_TOKEN
    const from       = process.env.TWILIO_PHONE_NUMBER

    if (accountSid && authToken && from) {
      const trimName  = (name as string).trim()
      const trimPhone = (phone as string)?.trim()
      const contact   = trimPhone
        ? `Call now: ${trimPhone}.`
        : 'View details in your dashboard.'

      const smsBody = eng?.ctaClicked === 'showing'
        ? `🔥 theQRealtor Alert: ${trimName} requested a showing at ${property.address}. ${contact} Reply STOP to opt out.`
        : `🔥 theQRealtor Alert: HOT lead — ${trimName} at ${property.address}. ${contact} Reply STOP to opt out.`

      console.log('[submit-lead] twilio send attempted — to:', property.agent_phone, '| from:', from)
      try {
        const msg = await twilio(accountSid, authToken).messages.create({
          to:   property.agent_phone,
          from,
          body: smsBody,
        })
        console.log('[submit-lead] hot SMS sent OK — sid:', msg.sid, '| status:', msg.status)
      } catch (smsErr: any) {
        // Never block lead capture on SMS failure.
        console.error('[submit-lead] SMS error — code:', smsErr?.code, '| message:', smsErr?.message)
      }
    } else {
      console.warn('[submit-lead] hot SMS skipped — missing Twilio env vars',
        '| TWILIO_ACCOUNT_SID:', !!accountSid, '| TWILIO_AUTH_TOKEN:', !!authToken, '| TWILIO_PHONE_NUMBER:', !!from)
    }
  }

  return NextResponse.json({ ok: true })
}
