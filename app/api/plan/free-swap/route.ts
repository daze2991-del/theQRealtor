import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { createAdminSupabase } from '@/lib/supabase-admin'
import { choiceEligibility, loadChoiceProfile, parseSelection, selectionErrorResponse } from '@/lib/planChoice'

// Free agents only: change which listing (max 1) and signs (max 3) stay
// active. The new selection is unlocked and everything else live is locked,
// in one transaction (apply_free_selection 'swap', migration 060). Never deletes.
// At most one counted listing change and one counted sign change per 30 days
// (migration 062). A refusal is 429 with nextChangeAt (ISO).
// While a downgrade's choice is pending (plan_choice_required_at, migration
// 067), the save is that free post-downgrade choice instead
// (apply_plan_selection): no swap clock is used and "too soon" can't apply.
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
  let profile: Awaited<ReturnType<typeof loadChoiceProfile>>
  try {
    profile = await loadChoiceProfile(admin, user.id)
  } catch (err: any) {
    console.error('[plan/free-swap] profile error:', err?.message)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
  if (profile?.plan !== 'free') {
    return NextResponse.json({ error: 'Only available on the Free plan.' }, { status: 403 })
  }

  const sel = parseSelection(body)
  if (!sel.ok) return NextResponse.json({ error: sel.error }, { status: 400 })

  if (choiceEligibility(profile.plan, profile.beta_joined_at, profile.plan_choice_required_at) === 'downgrade') {
    const { data, error } = await admin.rpc('apply_plan_selection', {
      p_agent: user.id, p_listings: sel.listingIds, p_signs: sel.signIds,
    })
    if (error) {
      const mapped = selectionErrorResponse(error.message)
      if (mapped.status === 500) console.error('[plan/free-swap] apply_plan_selection error:', error.message)
      return NextResponse.json({ error: mapped.error }, { status: mapped.status })
    }
    return NextResponse.json({ ok: true, result: data ?? null })
  }

  const { data, error } = await admin.rpc('apply_free_selection', {
    p_agent: user.id, p_mode: 'swap', p_listing: sel.listingId, p_signs: sel.signIds,
  })
  if (error) {
    const mapped = selectionErrorResponse(error.message)
    if (mapped.status === 500) console.error('[plan/free-swap] rpc error:', error.message)
    return NextResponse.json(
      mapped.nextChangeAt ? { error: mapped.error, nextChangeAt: mapped.nextChangeAt } : { error: mapped.error },
      { status: mapped.status },
    )
  }
  return NextResponse.json({ ok: true, result: data ?? null })
}
