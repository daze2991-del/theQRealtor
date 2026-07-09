import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { createAdminSupabase } from '@/lib/supabase-admin'

// Rename a sign.
export async function PATCH(
  req: Request,
  { params }: { params: { signId: string } }
) {
  const supabase = createServerSupabase()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { label?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const label = typeof body.label === 'string' ? body.label.trim() : ''
  if (!label) {
    return NextResponse.json({ error: 'Please enter a sign label.' }, { status: 400 })
  }

  const admin = createAdminSupabase()

  const { data: sign } = await admin
    .from('signs')
    .select('id')
    .eq('id', params.signId)
    .eq('agent_id', user.id)
    .maybeSingle()
  if (!sign) {
    return NextResponse.json({ error: 'Sign not found.' }, { status: 403 })
  }

  const { data: updated, error: updateError } = await admin
    .from('signs')
    .update({ label })
    .eq('id', params.signId)
    .select('id, label, created_at')
    .single()

  if (updateError || !updated) {
    console.error('[signs/patch] error:', updateError)
    return NextResponse.json({ error: 'Failed to rename the sign. Please try again.' }, { status: 500 })
  }

  return NextResponse.json({ sign: updated })
}
