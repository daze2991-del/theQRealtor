import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { createAdminSupabase } from '@/lib/supabase-admin'
import { getTrialStatus } from '@/lib/trial'
import { parseSelection, selectionErrorResponse } from '@/lib/planChoice'

// Expired trial → Free. Body: { listingIds: string[] (max 1), signIds: string[] (max 3) }.
// Only for an agent whose trial has actually expired. Sets plan='free' and
// locks every other live listing / active sign in one transaction
// (apply_free_selection, migration 060). Never deletes anything.
// Idempotent: once on Free this returns success without changing anything.
// Changing the selection afterwards is /api/plan/free-swap.
export async function POST(req: Request) {
  const supabase = createServerSupabase()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const admin = createAdminSupabase()
  const { data: profile } = await admin
    .from('profiles').select('plan, beta_joined_at').eq('id', user.id).maybeSingle()

  if (profile?.plan === 'free') {
    return NextResponse.json({ ok: true, plan: 'free', alreadyFree: true })
  }
  if (profile?.plan !== 'trial' || !getTrialStatus(profile?.beta_joined_at, profile?.plan).expired) {
    return NextResponse.json({ error: 'This choice is available once your trial has ended.' }, { status: 403 })
  }

  const sel = parseSelection(body)
  if (!sel.ok) return NextResponse.json({ error: sel.error }, { status: 400 })

  const { data, error } = await admin.rpc('apply_free_selection', {
    p_agent: user.id, p_mode: 'choose', p_listing: sel.listingId, p_signs: sel.signIds,
  })
  if (error) {
    const mapped = selectionErrorResponse(error.message)
    if (mapped.status === 500) console.error('[plan/choose-free] rpc error:', error.message)
    return NextResponse.json({ error: mapped.error }, { status: mapped.status })
  }
  return NextResponse.json({ ok: true, plan: 'free', result: data ?? null })
}
