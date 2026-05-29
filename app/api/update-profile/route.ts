import { NextResponse } from 'next/server'
import { createServerSupabase } from '../../../lib/supabase-server'
import { createAdminSupabase } from '../../../lib/supabase-admin'

export async function POST(request: Request) {
  // ── env diagnostics ────────────────────────────────────────────────────────
  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  console.log('[update-profile] env check — url present:', !!supaUrl,
    '| service key present:', !!svcKey,
    '| service key prefix:', svcKey.slice(0, 12) || '(empty)',
    '| service key looks like anon key:', svcKey.startsWith('eyJ') && svcKey.length < 200)

  // Authenticate via the server session — never trust client-supplied user IDs
  const serverSupabase = createServerSupabase()
  const { data: { user }, error: authCheckErr } = await serverSupabase.auth.getUser()
  console.log('[update-profile] auth.getUser —', user ? `uid=${user.id}` : 'no user', '| err:', authCheckErr?.message ?? 'none')

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const { name, phone, smsEnabled, agentPhone } = body
  console.log('[update-profile] body keys:', Object.keys(body))

  const admin = createAdminSupabase()

  // Keep profile data and auth metadata in one server-side write path so the
  // browser never needs elevated table permissions or auth-side sync hooks.
  const { error: authErr } = await admin.auth.admin.updateUserById(user.id, {
    user_metadata: {
      phone: String(phone ?? '').trim(),
      sms_enabled: Boolean(smsEnabled),
    },
  })

  if (authErr) {
    console.error('[update-profile] auth.admin.updateUserById error:', JSON.stringify(authErr))
    return NextResponse.json({ error: authErr.message }, { status: 500 })
  }

  // Update profiles.name — admin client bypasses table-level GRANT issues
  const { error: profileErr } = await admin
    .from('profiles')
    .update({ name: String(name ?? '').trim() })
    .eq('id', user.id)

  if (profileErr) {
    console.error('[update-profile] profiles.update error:', JSON.stringify(profileErr),
      '| code:', (profileErr as any).code,
      '| hint:', (profileErr as any).hint,
      '| details:', (profileErr as any).details)
    return NextResponse.json({ error: profileErr.message }, { status: 500 })
  }

  console.log('[update-profile] profiles.update OK')

  // Sync agent_phone to all user's properties so the SMS flow picks it up
  const { data: props, error: propsSelectErr } = await admin
    .from('properties')
    .select('id')
    .eq('user_id', user.id)

  if (propsSelectErr) {
    console.error('[update-profile] properties.select error:', JSON.stringify(propsSelectErr))
  }

  if (props && props.length > 0) {
    const ids = props.map((p: any) => p.id)
    const { error: propErr } = await admin
      .from('properties')
      .update({ agent_phone: agentPhone || null })
      .in('id', ids)

    if (propErr) {
      console.error('[update-profile] properties.update error:', JSON.stringify(propErr),
        '| code:', (propErr as any).code)
      return NextResponse.json({ error: propErr.message }, { status: 500 })
    }
  }

  console.log('[update-profile] done OK')
  return NextResponse.json({ ok: true })
}
