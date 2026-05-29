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
    .select('property_id')
    .eq('id', qrId)
    .single()

  if (error || !qrCode) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  // Increment scan_count via the existing security-definer RPC
  await supabase.rpc('increment_qr_scan_count', { qr_code_id: qrId })

  // Pass qrId as a query param so the property page can attribute the lead
  const destination = new URL(`/p/${qrCode.property_id}`, request.url)
  destination.searchParams.set('qr', qrId)

  return NextResponse.redirect(destination)
}
