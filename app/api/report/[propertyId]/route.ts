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

  // Property + photo + leads + this property's QR codes (parallel).
  const [propRes, photoRes, leadRes, qrRes] = await Promise.all([
    supabase.from('properties')
      .select('id, address, city, state, active, created_at, agent_name, agent_phone, price, beds, baths')
      .eq('id', propertyId).single(),
    supabase.from('property_photos').select('url')
      .eq('property_id', propertyId).order('sort_order', { ascending: true }).limit(1),
    // tier drives the lead-quality breakdown; motivation kept as a legacy fallback.
    supabase.from('leads')
      .select('id, tier, motivation, notes, created_at')
      .eq('property_id', propertyId).order('created_at', { ascending: false }),
    supabase.from('qrcodes').select('id, label, scan_count').eq('property_id', propertyId),
  ])

  if (!propRes.data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Scan events are linked by qr_id, NOT property_id (property_id is NULL on
  // rows written by the createLead path and pre-migration-009 rows). Counting
  // via the property's qr_ids is the complete, RLS-safe pattern.
  const qrIds = (qrRes.data ?? []).map((q: any) => q.id)

  let scanEvents: any[] = []
  let totalScanCount = 0
  let uniqueVisitCount = 0
  if (qrIds.length > 0) {
    const [scanRes, scanCountRes, uniqueRes] = await Promise.all([
      supabase.from('scan_events')
        .select('created_at, qr_id, return_visit, cta_clicked, photos_viewed, time_on_page_sec')
        .in('qr_id', qrIds).gte('created_at', windowStart)
        .order('created_at', { ascending: false }).limit(2000),
      supabase.from('scan_events').select('*', { count: 'exact', head: true }).in('qr_id', qrIds),
      // Unique buyer visits ≈ distinct devices: each device's first scan has
      // return_visit=false (repeat visits are true). No device-id column exists.
      supabase.from('scan_events').select('*', { count: 'exact', head: true })
        .in('qr_id', qrIds).eq('return_visit', false),
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
    qrCodes:        qrRes.data    ?? [],
    packetCount,
    packets,
    totalScanCount,
    uniqueVisitCount,
  })
}
