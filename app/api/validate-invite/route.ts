import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: Request) {
  const { code } = await req.json()
  const normalizedCode = code.trim().toUpperCase()

  const { data, error } = await adminSupabase
    .from('invite_codes')
    .update({ redeemed: true, redeemed_at: new Date().toISOString() })
    .eq('code', normalizedCode)
    .eq('redeemed', false)
    .select('id')

  if (error || !data || data.length === 0) {
    return NextResponse.json(
      { error: 'Invalid or already-used invite code' },
      { status: 400 }
    )
  }

  return NextResponse.json({ success: true, id: data[0].id })
}
