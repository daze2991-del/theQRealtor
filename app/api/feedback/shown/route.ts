import { NextResponse } from 'next/server'
import { createServerSupabase } from '../../../../lib/supabase-server'
import { createAdminSupabase } from '../../../../lib/supabase-admin'
import { SHOWN_COOLDOWN_DAYS, daysFromNow } from '../../../../lib/feedback'

// POST /api/feedback/shown  → markFeedbackShown()
// Records that the card was rendered to this agent and sets a short (~3d)
// cooldown so a shown-but-ignored prompt doesn't reappear the next session. This
// is deliberately shorter than the dismiss (~14d) and submit (~30d) cooldowns,
// which still take precedence when the agent actually acts. Same-session repeats
// are additionally prevented client-side.
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
        last_shown_at: now.toISOString(),
        next_eligible_at: daysFromNow(SHOWN_COOLDOWN_DAYS, now).toISOString(),
        updated_at: now.toISOString(),
      },
      { onConflict: 'agent_id' },
    )

  if (error) {
    console.error('[feedback/shown] upsert error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
