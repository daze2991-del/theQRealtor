import { NextResponse } from 'next/server'
import { createServerSupabase } from '../../../../lib/supabase-server'
import { createAdminSupabase } from '../../../../lib/supabase-admin'
import { isEligible } from '../../../../lib/feedback'

// GET /api/feedback/eligibility
// Server-authoritative check driving whether the dashboard shows the prompt.
// Identity comes from the session — never a client-supplied id.
export async function GET() {
  const serverSupabase = createServerSupabase()
  const { data: { user } } = await serverSupabase.auth.getUser()
  if (!user) return NextResponse.json({ eligible: false }, { status: 401 })

  const admin = createAdminSupabase()
  const [{ data: profile }, { data: state }] = await Promise.all([
    admin.from('profiles').select('created_at').eq('id', user.id).maybeSingle(),
    admin.from('feedback_prompt_state').select('next_eligible_at').eq('agent_id', user.id).maybeSingle(),
  ])

  const eligible = isEligible({
    accountCreatedAt: (profile?.created_at as string | null) ?? user.created_at,
    nextEligibleAt: (state?.next_eligible_at as string | null) ?? null,
  })

  return NextResponse.json({ eligible })
}
