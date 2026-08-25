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
  const {
    name, phone, smsEnabled, agentPhone,
    dre, brokerage, photoUrl,
    notifyShowing, notifyQuestion, notifyHotLead, quietHoursStart, quietHoursEnd,
  } = body
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

  // Update profiles — admin client bypasses table-level GRANT issues.
  // profiles.phone is the agent's real number used for SMS alerts + inbound
  // reply forwarding; notification prefs + quiet hours live here too.
  const profileUpdate: Record<string, unknown> = { name: String(name ?? '').trim() }
  profileUpdate.phone = String(phone ?? '').trim() || null
  // Agent identity fields — only written when the client actually sent the key,
  // so a caller that omits them (e.g. an older client) never blanks them out.
  if (typeof dre       === 'string') profileUpdate.dre       = dre.trim() || null
  if (typeof brokerage === 'string') profileUpdate.brokerage = brokerage.trim() || null
  if (typeof photoUrl  === 'string') profileUpdate.photo_url = photoUrl.trim() || null
  if (typeof notifyShowing  === 'boolean') profileUpdate.notify_showing  = notifyShowing
  if (typeof notifyQuestion === 'boolean') profileUpdate.notify_question = notifyQuestion
  if (typeof notifyHotLead  === 'boolean') profileUpdate.notify_hot_lead = notifyHotLead
  if (typeof quietHoursStart === 'string' && quietHoursStart) profileUpdate.quiet_hours_start = quietHoursStart
  if (typeof quietHoursEnd   === 'string' && quietHoursEnd)   profileUpdate.quiet_hours_end   = quietHoursEnd

  const { error: profileErr } = await admin
    .from('profiles')
    .update(profileUpdate)
    .eq('id', user.id)

  if (profileErr) {
    console.error('[update-profile] profiles.update error:', JSON.stringify(profileErr),
      '| code:', (profileErr as any).code,
      '| hint:', (profileErr as any).hint,
      '| details:', (profileErr as any).details)
    return NextResponse.json({ error: profileErr.message }, { status: 500 })
  }

  console.log('[update-profile] profiles.update OK')

  // Sync agent_phone + agent_name to all user's properties. agent_phone feeds
  // the SMS flow; agent_name is what the buyer-facing property page and the
  // seller report display. Both are denormalized copies on properties, so a
  // profile edit has to fan out or they silently drift from the profile.
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
      .update({
        agent_phone: agentPhone || null,
        agent_name:  String(name ?? '').trim() || null,
      })
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
