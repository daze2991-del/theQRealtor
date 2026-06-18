import { NextResponse } from 'next/server'
import { createAdminSupabase } from '../../../lib/supabase-admin'
import { computeScoreV2, isLikelyBot, type EngagementInputV2 } from '../../../lib/leadScoringV2'

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

export async function POST(request: Request) {
  const ip = (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown'
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: 'Too many submissions. Please wait a minute.' }, { status: 429 })
  }

  const ua = request.headers.get('user-agent') ?? ''
  if (isLikelyBot(ua)) return NextResponse.json({ ok: true })

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const { propertyId, name, phone, email, working_with_agent, sms_consent } =
    body as Record<string, unknown>

  const trimmedName  = (name  as string)?.trim() || ''
  const trimmedPhone = (phone as string)?.trim() || ''
  const trimmedEmail = (email as string)?.trim() || ''

  if (!propertyId || !trimmedName || !trimmedPhone) {
    return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 })
  }

  const supabase = createAdminSupabase()

  const { data: property, error: propError } = await supabase
    .from('properties')
    .select('id, address, user_id, active')
    .eq('id', propertyId)
    .single()

  if (propError || !property || !property.active) {
    return NextResponse.json({ error: 'Property not found.' }, { status: 404 })
  }

  // Same base V2 scoring as submit-lead for a brand-new lead with no engagement data
  const engV2: EngagementInputV2 = {
    visitCount: 1, photosViewed: 0, totalPhotos: 0,
    timeOnPageSec: 0, ctaClicked: null, hasSaved: false,
  }
  const v2Score = computeScoreV2({
    eng: engV2,
    hasValidContact: true,
    prev: { returnVisitCount: 0, photoViewCount: 0, totalTimeSec: 0, breakdown: {} },
  })

  const doNotContact = working_with_agent === true

  const { error: insertError } = await supabase.from('leads').insert({
    property_id:        propertyId,
    qr_id:              null,
    name:               trimmedName,
    phone:              trimmedPhone,
    email:              trimmedEmail,
    agent_id:           property.user_id || null,
    source:             'open_house_checkin',
    working_with_agent: working_with_agent as boolean | null,
    do_not_contact:     doNotContact,
    sms_consent:        sms_consent === true,
    contact_quality:    trimmedPhone ? 'phone' : trimmedEmail ? 'email_only' : 'none',
    motivation:         v2Score.tier,
    intent_score:       v2Score.intent_score,
    tier:               v2Score.tier,
    last_activity_at:   new Date().toISOString(),
    return_visit_count: v2Score.return_visit_count,
    photo_view_count:   v2Score.photo_view_count,
    total_time_on_page: v2Score.total_time_on_page,
    score_breakdown:    v2Score.score_breakdown,
  })

  if (insertError) {
    console.error('[open-house-checkin] insert error:', insertError)
    return NextResponse.json({ error: 'Failed to save your info. Please try again.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
