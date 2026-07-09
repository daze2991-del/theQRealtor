import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { createAdminSupabase } from '@/lib/supabase-admin'

// Close a sign's active assignment. History rows are kept — only
// unassigned_at is stamped.
export async function POST(req: Request) {
  const supabase = createServerSupabase()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { sign_id?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const signId = typeof body.sign_id === 'string' ? body.sign_id : ''
  if (!signId) {
    return NextResponse.json({ error: 'Missing sign.' }, { status: 400 })
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

  const { error: closeError } = await admin
    .from('sign_assignments')
    .update({ unassigned_at: new Date().toISOString() })
    .eq('sign_id', signId)
    .is('unassigned_at', null)
  if (closeError) {
    console.error('[signs/unassign] error:', closeError)
    return NextResponse.json({ error: 'Failed to unassign the sign. Please try again.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
