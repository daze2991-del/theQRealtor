import { NextResponse } from 'next/server'
import { createAdminSupabase } from '../../../../lib/supabase-admin'

// Public seller report data. The propertyId in the URL is the access token —
// this runs server-side with the admin client and returns AGGREGATE data only
// (no buyer names, phones, or emails are ever included in the response).
export async function GET(
  _req: Request,
  { params }: { params: { propertyId: string } }
) {
  const { propertyId } = params
  const supabase = createAdminSupabase()
  // Wider window so "total" stats and the 8-week / peak charts have full coverage.
  const windowStart = new Date(Date.now() - 365 * 86_400_000).toISOString()

  // Property + photo + leads + signs currently assigned to this property (parallel).
  // qrcodes (the old direct property_id -> QR-code table) is now empty/retired;
  // signs is assigned to properties via sign_assignments instead.
  const [propRes, photoRes, leadRes, assignmentRes] = await Promise.all([
    supabase.from('properties')
      .select('id, address, city, state, active, created_at, agent_name, agent_phone, price, beds, baths')
      .eq('id', propertyId).single(),
    supabase.from('property_photos').select('url')
      .eq('property_id', propertyId).order('sort_order', { ascending: true }).limit(1),
    // tier drives the lead-quality breakdown; motivation kept as a legacy fallback.
    supabase.from('leads')
      .select('id, tier, motivation, notes, created_at')
      .eq('property_id', propertyId).order('created_at', { ascending: false }),
    supabase.from('sign_assignments').select('sign_id, signs(id, label)').eq('property_id', propertyId).is('unassigned_at', null),
  ])

  if (!propRes.data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

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
    leads:          leadRes.data  ?? [],
    scanEvents,
    qrCodes,
    packetCount,
    packets,
    totalScanCount,
    uniqueVisitCount,
  })
}
