import { NextResponse } from 'next/server'
import { createAdminSupabase } from '../../../lib/supabase-admin'

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const { code } = body as { code?: string }

  if (!code || typeof code !== 'string') {
    return NextResponse.json({ valid: false, error: 'Invite code is required.' }, { status: 400 })
  }

  const normalizedCode = code.trim().toUpperCase()
  const adminSupabase = createAdminSupabase()

  const { data, error } = await adminSupabase
    .from('invite_codes')
    .update({ redeemed: true, redeemed_at: new Date().toISOString() })
    .eq('code', normalizedCode)
    .eq('redeemed', false)
    .select('id')
    .single()

  if (error || !data) {
    return NextResponse.json(
      { error: 'Invalid or already-used invite code' },
      { status: 400 }
    )
  }

  return NextResponse.json({ success: true, id: data.id })
}
