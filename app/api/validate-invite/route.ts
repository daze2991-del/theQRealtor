import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: Request) {
  const { code } = await req.json()
  const normalizedCode = code.trim().toUpperCase()

  console.log('[validate-invite] URL:', process.env.NEXT_PUBLIC_SUPABASE_URL)
  console.log('[validate-invite] hasServiceKey:', !!process.env.SUPABASE_SERVICE_ROLE_KEY)
  console.log('[validate-invite] code:', normalizedCode)
  console.log('[validate-invite] code length:', normalizedCode.length)
  console.log('[validate-invite] code JSON:', JSON.stringify(normalizedCode))

  const { data: allRows, error: selectError } = await adminSupabase
    .from('invite_codes')
    .select('code, redeemed')

  console.log('[validate-invite] all rows:', JSON.stringify(allRows))
  console.log('[validate-invite] select error:', JSON.stringify(selectError))

  return NextResponse.json({ debug: true, rows: allRows, code: normalizedCode })
}
