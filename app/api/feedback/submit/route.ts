import { NextResponse } from 'next/server'
import { createServerSupabase } from '../../../../lib/supabase-server'
import { createAdminSupabase } from '../../../../lib/supabase-admin'
import { SUBMIT_COOLDOWN_DAYS, MAX_COMMENT_LEN, daysFromNow } from '../../../../lib/feedback'

// POST /api/feedback/submit  → submitFeedback({ rating, comment })
// Records a real response and holds off asking again for ~30 days. agent_id is
// taken from the session, never the request body.
export async function POST(request: Request) {
  const serverSupabase = createServerSupabase()
  const { data: { user } } = await serverSupabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))

  const rating = Number(body?.rating)
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ error: 'rating must be an integer 1–5' }, { status: 400 })
  }

  let comment: string | null = null
  if (typeof body?.comment === 'string') {
    const trimmed = body.comment.trim()
    comment = trimmed ? trimmed.slice(0, MAX_COMMENT_LEN) : null
  }

  const now = new Date()
  const admin = createAdminSupabase()

  const { error: insertErr } = await admin
    .from('feedback_responses')
    .insert({ agent_id: user.id, rating, comment, context: 'general_experience' })

  if (insertErr) {
    console.error('[feedback/submit] insert error:', insertErr.message)
    return NextResponse.json({ error: insertErr.message }, { status: 500 })
  }

  // Longer cooldown after a genuine response.
  const { error: stateErr } = await admin
    .from('feedback_prompt_state')
    .upsert(
      {
        agent_id: user.id,
        last_shown_at: now.toISOString(),
        next_eligible_at: daysFromNow(SUBMIT_COOLDOWN_DAYS, now).toISOString(),
        updated_at: now.toISOString(),
      },
      { onConflict: 'agent_id' },
    )

  if (stateErr) {
    // The response is already saved; a cooldown write failure shouldn't 500 the
    // user's successful submission. Log and move on.
    console.error('[feedback/submit] state upsert error (response saved):', stateErr.message)
  }

  return NextResponse.json({ ok: true })
}
