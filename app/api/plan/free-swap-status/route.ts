import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { createAdminSupabase } from '@/lib/supabase-admin'
import { loadSwapStatus } from '@/lib/planChoice'

// When a Free agent can next change their active listing / signs (migration
// 062, free_swap_availability). Used by the Properties and Signs pages to show
// the date in place of the "change" link while the 30-day limit applies.
// The swap route enforces the same rule itself; this is display only.
export async function GET() {
  const supabase = createServerSupabase()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminSupabase()
  const { data: profile } = await admin
    .from('profiles').select('plan').eq('id', user.id).maybeSingle()
  if (profile?.plan !== 'free') {
    return NextResponse.json({ error: 'Only available on the Free plan.' }, { status: 403 })
  }

  try {
    return NextResponse.json(await loadSwapStatus(admin, user.id))
  } catch (err: any) {
    console.error('[plan/free-swap-status] error:', err?.message)
    return NextResponse.json({ error: 'Failed to load. Please try again.' }, { status: 500 })
  }
}
