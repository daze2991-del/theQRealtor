import { NextResponse } from 'next/server'
import { createAdminSupabase } from '../../../lib/supabase-admin'
import { computeIntent, type EngagementData } from '../../../lib/leadScoring'
import { computeScoreV2, isLikelyBot, type EngagementInputV2 } from '../../../lib/leadScoringV2'
import { sendSms, resolveAgentPhone, queueOrSendAgentSms, msg } from '../../../lib/twilio'

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

  const trimmedPhone = (phone as string)?.trim() || ''
  const trimmedEmail = (email as string)?.trim() || ''

  if (!propertyId || !(name as string)?.trim() || !ctaMotivation) {
    return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 })
  }
  // CTA-dependent contact rules: a lead needs at least one reachable channel
  // (phone OR email). The buyer's form enforces which is required per CTA.
  if (!trimmedPhone && !trimmedEmail) {
    return NextResponse.json({ error: 'Please provide a phone number or email.' }, { status: 400 })
  }

  // contact_quality drives follow-up routing. 'verified_phone' is reserved for a
  // future SMS-verification step and is not set here.
  const contactQuality: 'phone' | 'email_only' | 'none' =
    trimmedPhone ? 'phone' : trimmedEmail ? 'email_only' : 'none'

  // ── bot filter ──────────────────────────────────────────────────────────────
  const ua = request.headers.get('user-agent') ?? ''
  if (isLikelyBot(ua)) {
    // Silently discard bot submissions — don't reveal the filter to scrapers.
    return NextResponse.json({ ok: true })
  }

  // ── engagement data ──────────────────────────────────────────────────────────
  const eng = engagement as (EngagementData & { visitCount?: number; returnVisit?: boolean; totalPhotos?: number }) | undefined

  // V1 motivation label (kept for backward compat with existing UI queries)
  const computedMotivation = eng
    ? computeIntent({
        visitCount:    typeof eng.visitCount === 'number' ? eng.visitCount : (eng.returnVisit ? 2 : 1),
        photosViewed:  typeof eng.photosViewed  === 'number' ? eng.photosViewed  : 0,
        ctaClicked:    eng.ctaClicked ?? null,
        timeOnPageSec: typeof eng.timeOnPageSec === 'number' ? eng.timeOnPageSec : 0,
      })
    : ctaMotivation

  // V2 score — computed server-side from the same engagement payload
  const engV2: EngagementInputV2 = {
    visitCount:    typeof eng?.visitCount === 'number' ? eng.visitCount : (eng?.returnVisit ? 2 : 1),
    photosViewed:  typeof eng?.photosViewed  === 'number' ? eng.photosViewed  : 0,
    totalPhotos:   typeof eng?.totalPhotos   === 'number' ? eng.totalPhotos   : 0,
    timeOnPageSec: typeof eng?.timeOnPageSec === 'number' ? eng.timeOnPageSec : 0,
    ctaClicked:    (eng?.ctaClicked as EngagementInputV2['ctaClicked']) ?? null,
    hasSaved:      false,
  }
  const hasValidContact = !!(((phone as string)?.trim()) || ((email as string)?.trim()))
  const v2Score = computeScoreV2({
    eng: engV2,
    hasValidContact,
    prev: { returnVisitCount: 0, photoViewCount: 0, totalTimeSec: 0, breakdown: {} },
  })

  const supabase = createAdminSupabase()

  // ── fetch property — validate it exists, is active, and get agent_phone ─────
  // agent_phone comes from the DB only; the client never supplies it.
  const { data: property, error: propError } = await supabase
    .from('properties')
    .select('id, address, agent_name, agent_phone, active, user_id')
    .eq('id', propertyId)
    .single()

  console.log('[submit-lead] propertyId received:', propertyId)
  console.log('[submit-lead] propError:', propError?.message ?? 'none')
  console.log('[submit-lead] property found:', !!property, '| active:', property?.active ?? '(null)')

  if (propError || !property || !property.active) {
    return NextResponse.json({ error: 'Property not found.' }, { status: 404 })
  }

  // ── insert lead ─────────────────────────────────────────────────────────────
  const { data: insertedLead, error: insertError } = await supabase.from('leads').insert({
    property_id:        propertyId,
    qr_id:              (qrId as string) || null,
    name:               (name as string).trim(),
    phone:              trimmedPhone,
    email:              trimmedEmail,
    contact_quality:    contactQuality,
    motivation:         computedMotivation,   // V1 field — kept for compat
    notes:              (questionText as string)?.trim() || null,
    contact_preference: (contactPreference as string)?.trim() || null,
    agent_id:           property.user_id || null,
    // V2 scoring fields
    intent_score:       v2Score.intent_score,
    tier:               v2Score.tier,
    last_activity_at:   new Date().toISOString(),
    return_visit_count: v2Score.return_visit_count,
    photo_view_count:   v2Score.photo_view_count,
    total_time_on_page: v2Score.total_time_on_page,
    score_breakdown:    v2Score.score_breakdown,
  }).select('id').single()

  if (insertError || !insertedLead) {
    console.error('[submit-lead] insert error:', insertError)
    return NextResponse.json({ error: 'Failed to save your info. Please try again.' }, { status: 500 })
  }
  const leadId = insertedLead.id as string

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

  // ── SMS automation ────────────────────────────────────────────────────────────
  // Agent alerts (showing / question / first-time Hot), each gated on the agent's
  // notification toggles and held during quiet hours. Plus an immediate buyer
  // confirmation (showing/question CTAs, only when a phone was provided).
  const buyerName = (name as string).trim()
  const cta       = eng?.ctaClicked
  const address   = property.address as string
  const trimName  = buyerName

  try {
    const { data: agentProfile } = await supabase
      .from('profiles')
      .select('id, name, notify_showing, notify_question, notify_hot_lead, quiet_hours_start, quiet_hours_end')
      .eq('id', property.user_id)
      .single()

    if (agentProfile) {
      const agentPhone = await resolveAgentPhone(supabase, property.user_id)
      const agent = {
        id: agentProfile.id as string,
        quiet_hours_start: (agentProfile.quiet_hours_start as string) ?? '21:00',
        quiet_hours_end:   (agentProfile.quiet_hours_end as string)   ?? '08:00',
      }
      const dispatch = (message: string) =>
        queueOrSendAgentSms({ admin: supabase, agent, agentPhone, leadId, message })

      // Showing request
      if (cta === 'showing' && agentProfile.notify_showing !== false) {
        await dispatch(msg.showingAlert(trimName, address, leadId, trimmedPhone, trimmedEmail, (contactPreference as string)?.trim() || null))
      }
      // Question / info request
      if (cta === 'question' && agentProfile.notify_question !== false) {
        await dispatch(msg.questionAlert(trimName, address, leadId))
      }
      // Hot tier crossed — fire once per lead (guarded by hot_notified_at)
      if (v2Score.tier === 'hot' && agentProfile.notify_hot_lead !== false) {
        const { data: hotRows } = await supabase
          .from('leads')
          .update({ hot_notified_at: new Date().toISOString() })
          .eq('id', leadId).is('hot_notified_at', null)
          .select('id')
        if (hotRows && hotRows.length > 0) {
          await dispatch(msg.hotAlert(trimName, address, leadId))
        }
      }
    } else {
      console.warn('[submit-lead] no agent profile for', property.user_id, '— agent alerts skipped')
    }

    // Buyer confirmation — showing/question only, phone required, NOT quiet-hours gated
    if ((cta === 'showing' || cta === 'question') && trimmedPhone) {
      const agentName = (property.agent_name as string) || null
      const sid = await sendSms(trimmedPhone, msg.buyerConfirmation(buyerName, address, agentName))
      if (sid) {
        await supabase.from('leads').update({ buyer_texted_at: new Date().toISOString() }).eq('id', leadId)
      }
    }
  } catch (smsErr: any) {
    // Never block lead capture on notification failures.
    console.error('[submit-lead] notification error:', smsErr?.message)
  }

  return NextResponse.json({ ok: true })
}
