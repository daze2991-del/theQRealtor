import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { createAdminSupabase } from '@/lib/supabase-admin'
import { parseSelection, selectionErrorResponse } from '@/lib/planChoice'

// Free agents only: change which listing (max 1) and signs (max 3) stay
// active. The new selection is unlocked and everything else live is locked,
// in one transaction (apply_free_selection 'swap', migration 060). Never deletes.
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
    .from('profiles').select('plan').eq('id', user.id).maybeSingle()
  if (profile?.plan !== 'free') {
    return NextResponse.json({ error: 'Only available on the Free plan.' }, { status: 403 })
  }

  const sel = parseSelection(body)
  if (!sel.ok) return NextResponse.json({ error: sel.error }, { status: 400 })

  const { data, error } = await admin.rpc('apply_free_selection', {
    p_agent: user.id, p_mode: 'swap', p_listing: sel.listingId, p_signs: sel.signIds,
  })
  if (error) {
    const mapped = selectionErrorResponse(error.message)
    if (mapped.status === 500) console.error('[plan/free-swap] rpc error:', error.message)
    return NextResponse.json({ error: mapped.error }, { status: mapped.status })
  }
  return NextResponse.json({ ok: true, result: data ?? null })
}
