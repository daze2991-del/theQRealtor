import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const { name, email, password } = await req.json()

  if (!name || typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'Name is required.' }, { status: 400 })
  }
  if (!email || typeof email !== 'string') {
    return NextResponse.json({ error: 'Email is required.' }, { status: 400 })
  }
  if (!password || typeof password !== 'string' || password.length < 6) {
    return NextResponse.json({ error: 'Password must be at least 6 characters.' }, { status: 400 })
  }

  const e = email.trim().toLowerCase()

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Check allowlist — service role bypasses RLS; anon/authenticated are locked out
  const { data: allowRow } = await supabase
    .from('beta_allowlist')
    .select('approved')
    .eq('email', e)
    .single()

  if (!allowRow || allowRow.approved !== true) {
    return NextResponse.json(
      { error: 'This is a private beta. Access is by invitation only.' },
      { status: 403 }
    )
  }

  // Create user server-side with email pre-confirmed
  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email: e,
    password,
    email_confirm: true,
    user_metadata: { name: name.trim() },
  })

  if (createError) {
    if (createError.status === 422 || createError.message.toLowerCase().includes('already')) {
      return NextResponse.json(
        { error: 'This email already has an account. Please sign in instead.' },
        { status: 409 }
      )
    }
    return NextResponse.json(
      { error: 'Something went wrong creating your account. Please try again.' },
      { status: 500 }
    )
  }

  const userId = created.user.id

  // Stamp profile (auto-created by trigger); update beta fields
  await supabase
    .from('profiles')
    .update({ account_status: 'beta', beta_joined_at: new Date().toISOString() })
    .eq('id', userId)

  // Record when this allowlist slot was claimed
  await supabase
    .from('beta_allowlist')
    .update({ joined_at: new Date().toISOString() })
    .eq('email', e)

  return NextResponse.json({ ok: true })
}
