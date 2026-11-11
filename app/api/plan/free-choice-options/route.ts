import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { createAdminSupabase } from '@/lib/supabase-admin'
import { choiceEligibility, choiceLimits, loadChoiceProfile, loadFreeChoiceOptions, planName } from '@/lib/planChoice'

// The agent's live listings and active signs, with 30-day activity stats for
// the "Choose what stays active" screen. Available to an expired trial (first
// choice, Free's limits), to an agent whose plan was lowered and who hasn't
// confirmed yet (their current plan's limits, migration 067), and to Free
// agents (swap). Ranking itself is rankByActivity() in lib/planLock.ts,
// shared with the UI.
export async function GET() {
  const supabase = createServerSupabase()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminSupabase()
  try {
    const profile = await loadChoiceProfile(admin, user.id)
    const mode = choiceEligibility(profile?.plan, profile?.beta_joined_at, profile?.plan_choice_required_at)
    if (!mode) {
      return NextResponse.json({ error: 'Not available on your plan.' }, { status: 403 })
    }
    const targetPlan = mode === 'choose' ? 'free' : profile?.plan
    const options = await loadFreeChoiceOptions(admin, user.id)
    return NextResponse.json({ mode, planName: planName(targetPlan), limits: choiceLimits(mode, profile?.plan), ...options })
  } catch (err: any) {
    console.error('[plan/free-choice-options] load error:', err?.message)
    return NextResponse.json({ error: 'Failed to load your listings. Please try again.' }, { status: 500 })
  }
}
