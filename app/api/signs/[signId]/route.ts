import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { createAdminSupabase } from '@/lib/supabase-admin'
import { signLimitForPlan } from '@/lib/plans'

// Rename a sign, and/or archive/unarchive it.
//
// Archiving is entitlement accounting only: an archived sign keeps its rows,
// assignment history and scan attribution, and its printed QR keeps resolving
// through /p/{sign.id}. It simply stops consuming a plan slot.
export async function PATCH(
  req: Request,
  { params }: { params: { signId: string } }
) {
  const supabase = createServerSupabase()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { label?: unknown; archived?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const wantsRename  = typeof body.label === 'string'
  const wantsArchive = typeof body.archived === 'boolean'

  if (!wantsRename && !wantsArchive) {
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })
  }

  const label = wantsRename ? (body.label as string).trim() : ''
  if (wantsRename && !label) {
    return NextResponse.json({ error: 'Please enter a sign label.' }, { status: 400 })
  }

  const admin = createAdminSupabase()

  const { data: sign } = await admin
    .from('signs')
    .select('id, archived_at')
    .eq('id', params.signId)
    .eq('agent_id', user.id)
    .maybeSingle()
  if (!sign) {
    return NextResponse.json({ error: 'Sign not found.' }, { status: 403 })
  }

  const patch: Record<string, unknown> = {}
  if (wantsRename) patch.label = label

  if (wantsArchive) {
    const archiving = body.archived === true
    // UN-archiving pulls a sign back into active inventory, so it has to pass
    // the same limit check as creating one. Without this, archive → create →
    // unarchive would walk straight past the plan limit.
    if (!archiving && sign.archived_at !== null) {
      const { data: profile } = await admin
        .from('profiles').select('plan').eq('id', user.id).maybeSingle()
      const limit = signLimitForPlan(typeof profile?.plan === 'string' ? profile.plan : 'free')
      if (limit !== null) {
        const { count, error: countError } = await admin
          .from('signs')
          .select('id', { count: 'exact', head: true })
          .eq('agent_id', user.id)
          .is('archived_at', null)
        if (countError) {
          console.error('[signs/patch] count error:', countError)
          return NextResponse.json({ error: 'Failed to update the sign. Please try again.' }, { status: 500 })
        }
        if ((count ?? 0) >= limit) {
          return NextResponse.json(
            {
              error: `You've reached your active sign limit (${limit}) — archive another sign or upgrade to Pro.`,
              limitReached: true,
              limit,
            },
            { status: 403 }
          )
        }
      }
    }
    patch.archived_at = archiving ? new Date().toISOString() : null
  }

  const { data: updated, error: updateError } = await admin
    .from('signs')
    .update(patch)
    .eq('id', params.signId)
    .select('id, label, created_at, archived_at')
    .single()

  if (updateError || !updated) {
    console.error('[signs/patch] error:', updateError)
    return NextResponse.json({ error: 'Failed to update the sign. Please try again.' }, { status: 500 })
  }

  return NextResponse.json({ sign: updated })
}
