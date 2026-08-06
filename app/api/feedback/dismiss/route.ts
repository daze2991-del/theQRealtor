import { NextResponse } from 'next/server'
import { createServerSupabase } from '../../../../lib/supabase-server'
import { createAdminSupabase } from '../../../../lib/supabase-admin'
import { DISMISS_COOLDOWN_DAYS, daysFromNow } from '../../../../lib/feedback'

// POST /api/feedback/dismiss  → dismissFeedback()
// "Not now" — hold off asking again for ~14 days.
export async function POST() {
  const serverSupabase = createServerSupabase()
  const { data: { user } } = await serverSupabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const now = new Date()
  const admin = createAdminSupabase()
  const { error } = await admin
    .from('feedback_prompt_state')
    .upsert(
      {
        agent_id: user.id,
        next_eligible_at: daysFromNow(DISMISS_COOLDOWN_DAYS, now).toISOString(),
        updated_at: now.toISOString(),
      },
      { onConflict: 'agent_id' },
    )

  if (error) {
    console.error('[feedback/dismiss] upsert error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
