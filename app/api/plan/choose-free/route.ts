import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { createAdminSupabase } from '@/lib/supabase-admin'
import { choiceEligibility, choiceLimits, loadChoiceProfile, parseSelection, planName, selectionErrorResponse } from '@/lib/planChoice'

// Confirms what stays active. Body: { listingIds: string[], signIds: string[] }.
// Two cases, decided on the server:
//   • Post-downgrade choice (profiles.plan_choice_required_at set, migration
//     067): any plan's limits; apply_plan_selection(). Never starts the Free
//     30-day swap clocks. Clears the flag.
//   • Expired trial → Free: max 1 listing / 3 signs; sets plan='free' and locks
//     every other live listing / active sign in one transaction
//     (apply_free_selection 'choose'). Idempotent once on Free.
// Never deletes anything. Changing the selection later on Free is /api/plan/free-swap.
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
    console.error('[plan/choose-free] profile error:', err?.message)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
  const mode = choiceEligibility(profile?.plan, profile?.beta_joined_at, profile?.plan_choice_required_at)

  if (mode === 'downgrade') {
    const sel = parseSelection(body, choiceLimits(mode, profile?.plan), planName(profile?.plan))
    if (!sel.ok) return NextResponse.json({ error: sel.error }, { status: 400 })
    const { data, error } = await admin.rpc('apply_plan_selection', {
      p_agent: user.id, p_listings: sel.listingIds, p_signs: sel.signIds,
    })
    if (error) {
      const mapped = selectionErrorResponse(error.message)
      if (mapped.status === 500) console.error('[plan/choose-free] apply_plan_selection error:', error.message)
      return NextResponse.json({ error: mapped.error }, { status: mapped.status })
    }
    return NextResponse.json({ ok: true, plan: profile?.plan ?? null, result: data ?? null })
  }

  if (profile?.plan === 'free') {
    return NextResponse.json({ ok: true, plan: 'free', alreadyFree: true })
  }
  if (mode !== 'choose') {
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
