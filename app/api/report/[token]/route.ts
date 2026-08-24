import { NextResponse } from 'next/server'
import { createAdminSupabase } from '../../../../lib/supabase-admin'

// Public seller report data. The URL segment is properties.report_token — a
// PRIVATE credential, distinct from properties.id (which is semi-public: it is
// printed on QR signage and handed to buyers via /open-house/{propertyId}).
// A property id will NOT resolve here. Rotate the token via
// POST /api/properties/{id}/regenerate-report-token to kill a shared link.
//
// Runs server-side with the admin client and returns AGGREGATE data only —
// no buyer names, phones, emails, or buyer-authored text (see sanitize below).
export async function GET(
  _req: Request,
  { params }: { params: { token: string } }
) {
  const { token } = params
  const supabase = createAdminSupabase()
  // Wider window so "total" stats and the 8-week / peak charts have full coverage.
  const windowStart = new Date(Date.now() - 365 * 86_400_000).toISOString()

  // Resolve the token to a property FIRST — every query below filters on the
  // resolved row's real primary key, which is NOT the value in the URL. (Fan
  // -ning these out in parallel with the lookup would mean filtering
  // property_id by a token and silently returning an all-zeros report.)
  const propRes = await supabase.from('properties')
    .select('id, address, city, state, active, created_at, agent_name, agent_phone, price, beds, baths')
    .eq('report_token', token).maybeSingle()

  if (!propRes.data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const propertyId = propRes.data.id as string

  // Photo + leads + signs currently assigned to this property (parallel).
  // qrcodes (the old direct property_id -> QR-code table) is now empty/retired;
  // signs is assigned to properties via sign_assignments instead.
  const [photoRes, leadRes, assignmentRes] = await Promise.all([
    supabase.from('property_photos').select('url')
      .eq('property_id', propertyId).order('sort_order', { ascending: true }).limit(1),
    // tier drives the lead-quality breakdown; motivation kept as a legacy fallback.
    // `notes` is buyer-authored free text and must NEVER reach this response —
    // it is selected only to derive the has_notes presence flag below, then
    // dropped by the sanitize step after this Promise.all.
    supabase.from('leads')
      .select('id, tier, motivation, notes, created_at')
      .eq('property_id', propertyId).order('created_at', { ascending: false }),
    supabase.from('sign_assignments').select('sign_id, signs(id, label)').eq('property_id', propertyId).is('unassigned_at', null),
  ])

  // ── Sanitize leads before they leave this UNAUTHENTICATED endpoint ──────────
  // Reachable by anyone holding the report_token, which an agent may forward to
  // a seller (and a seller onward), so the response must carry no
  // buyer-authored content of any kind regardless of who ends up with the link.
  //
  // motivation is an unconstrained `text` column (migration 003, no CHECK) and
  // is client-supplied on one submit path (submit-lead falls back to the raw
  // request-body value when no engagement payload is present), so it cannot be
  // trusted to hold only known labels — allow-list it rather than pass it
  // through. The seller page still needs it for legacy-row tier resolution.
  const MOTIVATION_LABELS = new Set(['cold', 'warm', 'motivated', 'hot'])
  const leads = ((leadRes.data ?? []) as any[]).map(l => ({
    id:         l.id,
    tier:       l.tier,                                                   // DB-constrained enum (migration 019)
    motivation: MOTIVATION_LABELS.has(l.motivation) ? l.motivation : null,
    created_at: l.created_at,
    has_notes:  !!(l.notes && String(l.notes).trim()),                    // presence only — never the text
  }))

  const qrCodes = ((assignmentRes.data ?? []) as any[])
    .map(a => (Array.isArray(a.signs) ? a.signs[0] : a.signs))
    .filter(Boolean)

  // scan_events.property_id is now a required, reliable stamp on every row
  // (see /api/scan-events), so totals/unique-visits count directly off it;
  // the per-sign breakdown below still needs sign_id on each row.
  let scanEvents: any[] = []
  let totalScanCount = 0
  let uniqueVisitCount = 0
  {
    const [scanRes, scanCountRes, uniqueRes] = await Promise.all([
      supabase.from('scan_events')
        .select('created_at, sign_id, return_visit, cta_clicked, photos_viewed, time_on_page_sec')
        .eq('property_id', propertyId).gte('created_at', windowStart)
        .order('created_at', { ascending: false }).limit(2000),
      supabase.from('scan_events').select('*', { count: 'exact', head: true }).eq('property_id', propertyId),
      // Unique buyer visits ≈ distinct devices: each device's first scan has
      // return_visit=false (repeat visits are true). No device-id column exists.
      supabase.from('scan_events').select('*', { count: 'exact', head: true })
        .eq('property_id', propertyId).eq('return_visit', false),
    ])
    scanEvents = scanRes.data ?? []
    totalScanCount = scanCountRes.count ?? 0
    uniqueVisitCount = uniqueRes.count ?? 0
  }

  let packetCount = 0
  let packets: any[] = []
  try {
    const [countRes, recentRes] = await Promise.all([
      supabase.from('packet_requests').select('*', { count: 'exact', head: true }).eq('property_id', propertyId),
      supabase.from('packet_requests').select('created_at').eq('property_id', propertyId).gte('created_at', windowStart),
    ])
    packetCount = countRes.count ?? 0
    packets = recentRes.data ?? []
  } catch { /* table may not exist */ }

  return NextResponse.json({
    property:       propRes.data,
    photo:          photoRes.data?.[0]?.url ?? null,
    leads,
    scanEvents,
    qrCodes,
    packetCount,
    packets,
    totalScanCount,
    uniqueVisitCount,
  })
}
