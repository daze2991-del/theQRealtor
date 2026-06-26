import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const { code } = body as { code?: string }

  if (!code || typeof code !== 'string') {
    return NextResponse.json({ valid: false, error: 'Invite code is required.' }, { status: 400 })
  }

  const normalizedCode = code.trim().toUpperCase()

  const { data, error } = await adminSupabase
    .from('invite_codes')
    .update({ redeemed: true, redeemed_at: new Date().toISOString() })
    .eq('code', normalizedCode)
    .eq('redeemed', false)
    .select('id')

  console.log('[validate-invite] code:', normalizedCode)
  console.log('[validate-invite] data:', JSON.stringify(data))
  console.log('[validate-invite] error:', JSON.stringify(error))

  if (error || !data || data.length === 0) {
    return NextResponse.json(
      { error: 'Invalid or already-used invite code' },
      { status: 400 }
    )
  }

  return NextResponse.json({ success: true, id: data[0].id })
}
