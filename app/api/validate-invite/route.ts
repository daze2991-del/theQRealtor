import { NextResponse } from 'next/server'
import { createAdminSupabase } from '../../../lib/supabase-admin'

// POST { code }                    → check only, returns { valid, error? }
// POST { code, claim: true, email } → check + mark used atomically
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const { code, claim, email } = body as { code?: string; claim?: boolean; email?: string }

  if (!code || typeof code !== 'string') {
    return NextResponse.json({ valid: false, error: 'Invite code is required.' }, { status: 400 })
  }

  const normalised = code.trim().toUpperCase()
  const supabase = createAdminSupabase()

  const { data, error } = await supabase
    .from('invite_codes')
    .select('code, used')
    .eq('code', normalised)
    .single()

  if (error || !data) {
    return NextResponse.json({ valid: false, error: 'Invalid invite code.' })
  }

  if (data.used) {
    return NextResponse.json({ valid: false, error: 'This invite code has already been used.' })
  }

  if (claim && email) {
    await supabase
      .from('invite_codes')
      .update({ used: true, used_by_email: email.trim().toLowerCase(), used_at: new Date().toISOString() })
      .eq('code', normalised)
  }

  return NextResponse.json({ valid: true })
}
