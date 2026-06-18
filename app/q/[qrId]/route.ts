import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '../../../lib/supabase-server'

export async function GET(
  request: NextRequest,
  { params }: { params: { qrId: string } }
) {
  const { qrId } = params

  if (!qrId) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  const supabase = createServerSupabase()

  const { data: qrCode, error } = await supabase
    .from('qrcodes')
    .select('property_id, type')
    .eq('id', qrId)
    .single()

  if (error || !qrCode) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  // Increment scan_count via the existing security-definer RPC
  await supabase.rpc('increment_qr_scan_count', { qr_code_id: qrId })

  const isOpenHouse = (qrCode.type || 'property') === 'openhouse'

  if (isOpenHouse) {
    // Open House QR → check-in page (no qr param needed; check-in has its own form)
    return NextResponse.redirect(new URL(`/open-house/${qrCode.property_id}`, request.url))
  }

  // Property QR → buyer property page with qrId for lead attribution
  const destination = new URL(`/p/${qrCode.property_id}`, request.url)
  destination.searchParams.set('qr', qrId)

  return NextResponse.redirect(destination)
}
