import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { createAdminSupabase } from '@/lib/supabase-admin'

// Assign (or reassign) a sign to a property. Closes any active assignment
// first, then inserts a fresh row — history rows are never rewritten, and
// historical scans/leads keep their stamped property_id.
export async function POST(req: Request) {
  const supabase = createServerSupabase()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { sign_id?: unknown; property_id?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const signId = typeof body.sign_id === 'string' ? body.sign_id : ''
  const propertyId = typeof body.property_id === 'string' ? body.property_id : ''
  if (!signId || !propertyId) {
    return NextResponse.json({ error: 'Missing sign or property.' }, { status: 400 })
  }

  const admin = createAdminSupabase()

  const { data: sign } = await admin
    .from('signs')
    .select('id')
    .eq('id', signId)
    .eq('agent_id', user.id)
    .maybeSingle()
  if (!sign) {
    return NextResponse.json({ error: 'Sign not found.' }, { status: 403 })
  }

  const { data: property } = await admin
    .from('properties')
    .select('id')
    .eq('id', propertyId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!property) {
    return NextResponse.json({ error: 'Property not found.' }, { status: 403 })
  }

  const { error: closeError } = await admin
    .from('sign_assignments')
    .update({ unassigned_at: new Date().toISOString() })
    .eq('sign_id', signId)
    .is('unassigned_at', null)
  if (closeError) {
    console.error('[signs/assign] close error:', closeError)
    return NextResponse.json({ error: 'Failed to update the sign. Please try again.' }, { status: 500 })
  }

  const { error: insertError } = await admin
    .from('sign_assignments')
    .insert({ sign_id: signId, property_id: propertyId })
  if (insertError) {
    console.error('[signs/assign] insert error:', insertError)
    return NextResponse.json({ error: 'Failed to assign the sign. Please try again.' }, { status: 500 })
  }

  const { data: updated, error: fetchError } = await admin
    .from('signs')
    .select('id, label, created_at, sign_assignments(id, property_id, assigned_at, unassigned_at, properties(id, address, city, state))')
    .eq('id', signId)
    .single()
  if (fetchError || !updated) {
    console.error('[signs/assign] refetch error:', fetchError)
    return NextResponse.json({ error: 'Sign was assigned but could not be reloaded. Refresh the page.' }, { status: 500 })
  }

  return NextResponse.json({ sign: updated })
}
