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
    notifyShowing, notifyQuestion, notifyHotLead,
    quietHoursEnabled, quietHoursStart, quietHoursEnd,
  } = body
  console.log('[update-profile] body keys:', Object.keys(body))

  const admin = createAdminSupabase()

  // ── profiles FIRST, auth.user_metadata SECOND ───────────────────────────────
  // profiles.phone is guarded by the partial unique index profiles_phone_unique_idx
  // (see app/api/auth/beta-signup/route.ts) — this write can fail on a genuine
  // collision with another account's phone number. auth.user_metadata carries no
  // such constraint and always succeeds. Writing profiles first means a rejected
  // phone number is rejected everywhere: it can no longer get stuck in
  // user_metadata while never having actually been saved to profiles, which is
  // what happened when this route wrote metadata unconditionally before the
  // constrained write — a failed profiles update left metadata holding a value
  // the user never successfully saved, and Settings reads metadata as its
  // fallback source, so the rejected value looked "already saved" on next load
  // and reproduced the same failure on every retry.
  //
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
  if (typeof quietHoursEnabled === 'boolean') profileUpdate.quiet_hours_enabled = quietHoursEnabled
  // Same "omitted vs explicitly empty" distinction as dre/brokerage/photoUrl
  // above: typeof check gates whether the column is touched at all, so an
  // explicit empty string writes null instead of being silently dropped (the
  // previous `&& quietHoursStart` truthy check meant a cleared field never
  // saved and the old DB value survived with no error shown).
  if (typeof quietHoursStart === 'string') profileUpdate.quiet_hours_start = quietHoursStart.trim() || null
  if (typeof quietHoursEnd   === 'string') profileUpdate.quiet_hours_end   = quietHoursEnd.trim()   || null

  const { error: profileErr } = await admin
    .from('profiles')
    .update(profileUpdate)
    .eq('id', user.id)

  if (profileErr) {
    console.error('[update-profile] profiles.update error:', JSON.stringify(profileErr),
      '| code:', (profileErr as any).code,
      '| hint:', (profileErr as any).hint,
      '| details:', (profileErr as any).details)

    // 23505 = Postgres unique_violation. On this table that can only come from
    // profiles_phone_unique_idx (id is the PK and is not client-writable here),
    // so no need to inspect .details to disambiguate — mirrors the same code
    // handled in app/api/auth/beta-signup/route.ts, but that path returns a
    // generic message deliberately (pre-auth, avoids account enumeration);
    // this route is already-authenticated, so a specific message is safe and
    // more useful.
    if ((profileErr as any).code === '23505') {
      return NextResponse.json(
        { error: 'That phone number is already in use on another account.' },
        { status: 409 }
      )
    }

    return NextResponse.json({ error: profileErr.message }, { status: 500 })
  }

  console.log('[update-profile] profiles.update OK')

  // auth.user_metadata is a display/notification convenience mirror, never a
  // source of truth — only reached once the constrained write above succeeded,
  // so it can never hold a phone number that profiles itself rejected.
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
