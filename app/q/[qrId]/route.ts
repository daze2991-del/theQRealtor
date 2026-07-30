import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '../../../lib/supabase-server'
import { createAdminSupabase } from '../../../lib/supabase-admin'

// ── PERMANENT LEGACY BRIDGE — do not deprecate ────────────────────────────────
// Pre-sign printed QR codes encode /q/{qrcode.id}. Every legacy qrcode is
// mapped to a durable sign (qrcodes.sign_id, backfilled in migration 030), so
// this route resolves through the sign's CURRENT assignment and keeps working
// after any number of reassignments. A printed QR can never be re-printed, so
// this route must stay live for as long as any such sign might exist.
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
    .select('property_id, type, sign_id')
    .eq('id', qrId)
    .single()

  if (error || !qrCode) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  // Keep the legacy per-qrcode counter ticking via the existing
  // security-definer RPC (dashboard analytics still read it).
  await supabase.rpc('increment_qr_scan_count', { qr_code_id: qrId })

  const isOpenHouse = (qrCode.type || 'property') === 'openhouse'

  if (qrCode.sign_id) {
    if (isOpenHouse) {
      // Open-house QRs skip the buyer page and go straight to check-in, so the
      // current assignment must be resolved here. signs/sign_assignments are
      // owner-only under RLS — resolve with the admin client.
      const admin = createAdminSupabase()
      const { data: assignment } = await admin
        .from('sign_assignments')
        .select('property_id')
        .eq('sign_id', qrCode.sign_id)
        .is('unassigned_at', null)
        .maybeSingle()
      if (assignment?.property_id) {
        return NextResponse.redirect(new URL(`/open-house/${assignment.property_id}`, request.url))
      }
      // No active assignment — the buyer page shows the unassigned-sign state.
      return NextResponse.redirect(new URL(`/p/${qrCode.sign_id}`, request.url))
    }

    // Property QR → buyer page keyed by SIGN id. /p resolves the sign to its
    // current property, handles the unassigned state, and stamps sign_id on
    // scan_events/leads. qr param preserved for legacy qr_id attribution.
    const destination = new URL(`/p/${qrCode.sign_id}`, request.url)
    destination.searchParams.set('qr', qrId)
    return NextResponse.redirect(destination)
  }

  // Unmapped qrcode (no property at backfill time) — legacy property-bound
  // behavior, unchanged.
  if (!qrCode.property_id) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  if (isOpenHouse) {
    return NextResponse.redirect(new URL(`/open-house/${qrCode.property_id}`, request.url))
  }

  const destination = new URL(`/p/${qrCode.property_id}`, request.url)
  destination.searchParams.set('qr', qrId)

  return NextResponse.redirect(destination)
}
