import { NextResponse } from 'next/server'
import { createAdminSupabase } from '../../../../lib/supabase-admin'

export async function GET(
  _req: Request,
  { params }: { params: { propertyId: string } }
) {
  const { propertyId } = params
  const supabase = createAdminSupabase()
  const sixtyDaysAgo = new Date(Date.now() - 60 * 86_400_000).toISOString()

  const [propRes, photoRes, leadRes, scanRes, qrRes] = await Promise.all([
    supabase.from('properties')
      .select('id, address, city, state, active, created_at, agent_name, price, beds, baths')
      .eq('id', propertyId).single(),
    supabase.from('property_photos').select('url')
      .eq('property_id', propertyId).order('sort_order', { ascending: true }).limit(1),
    supabase.from('leads')
      .select('id, motivation, notes, created_at')
      .eq('property_id', propertyId).order('created_at', { ascending: false }),
    supabase.from('scan_events')
      .select('created_at, photos_viewed, time_on_page_sec, return_visit')
      .eq('property_id', propertyId).gte('created_at', sixtyDaysAgo)
      .order('created_at', { ascending: false }).limit(300),
    supabase.from('qrcodes').select('id, label, scan_count').eq('property_id', propertyId),
  ])

  if (!propRes.data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let packetCount = 0
  let packets: any[] = []
  try {
    const [countRes, recentRes] = await Promise.all([
      supabase.from('packet_requests').select('*', { count: 'exact', head: true }).eq('property_id', propertyId),
      supabase.from('packet_requests').select('created_at').eq('property_id', propertyId).gte('created_at', sixtyDaysAgo),
    ])
    packetCount = countRes.count ?? 0
    packets = recentRes.data ?? []
  } catch { /* table may not exist */ }

  return NextResponse.json({
    property:    propRes.data,
    photo:       photoRes.data?.[0]?.url ?? null,
    leads:       leadRes.data  ?? [],
    scanEvents:  scanRes.data  ?? [],
    qrCodes:     qrRes.data    ?? [],
    packetCount,
    packets,
  })
}
