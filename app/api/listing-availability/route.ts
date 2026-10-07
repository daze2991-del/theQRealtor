import { NextResponse } from 'next/server'
import { createAdminSupabase } from '@/lib/supabase-admin'
import { isAcceptingRequests } from '@/lib/planLock'

// Public: can buyers send requests on this listing (optionally via this sign)?
// Used by the buyer page (/p) and the open-house check-in page before they
// render request buttons or a form. The reason itself stays server-side
// (no plan, billing or trial wording); the only extra field is agentName,
// and ONLY when paused — properties.agent_name, the same display name buyer
// confirmation texts already use. Never phone, email, plan or trial state.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: Request) {
  let body: { propertyId?: unknown; signId?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }
  const propertyId = typeof body.propertyId === 'string' ? body.propertyId.trim() : ''
  const signId = typeof body.signId === 'string' && UUID_RE.test(body.signId.trim()) ? body.signId.trim() : null
  if (!UUID_RE.test(propertyId)) {
    return NextResponse.json({ error: 'Invalid listing.' }, { status: 400 })
  }

  const admin = createAdminSupabase()
  const acceptingRequests = await isAcceptingRequests(admin, propertyId, signId)
  if (acceptingRequests) {
    return NextResponse.json({ acceptingRequests: true })
  }

  const { data: property } = await admin
    .from('properties')
    .select('agent_name')
    .eq('id', propertyId)
    .maybeSingle()
  return NextResponse.json({ acceptingRequests: false, agentName: property?.agent_name ?? null })
}
