import { NextResponse } from 'next/server'
import { createAdminSupabase } from '@/lib/supabase-admin'

// Public sign → property resolution for the buyer page (/p/[id]).
// signs and sign_assignments are owner-only under RLS, so the anon client
// cannot resolve them — this runs server-side with the admin client and
// returns only whether the id is a sign and which property (if any) it is
// currently assigned to. No labels, owners, or history are exposed.
export async function POST(req: Request) {
  let body: { id?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const id = typeof body.id === 'string' ? body.id.trim() : ''
  // Not a UUID → cannot be a sign; let the caller fall back to property routing.
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ sign: false })
  }

  const admin = createAdminSupabase()

  const { data: sign, error: signError } = await admin
    .from('signs')
    .select('id')
    .eq('id', id)
    .maybeSingle()
  if (signError) {
    console.error('[signs/resolve] sign lookup error:', signError)
    return NextResponse.json({ error: 'Failed to resolve the sign.' }, { status: 500 })
  }
  if (!sign) {
    return NextResponse.json({ sign: false })
  }

  const { data: assignment, error: assignmentError } = await admin
    .from('sign_assignments')
    .select('property_id')
    .eq('sign_id', id)
    .is('unassigned_at', null)
    .maybeSingle()
  if (assignmentError) {
    console.error('[signs/resolve] assignment lookup error:', assignmentError)
    return NextResponse.json({ error: 'Failed to resolve the sign.' }, { status: 500 })
  }

  return NextResponse.json({ sign: true, propertyId: assignment?.property_id ?? null })
}
