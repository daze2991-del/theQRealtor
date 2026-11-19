import { NextResponse } from 'next/server'
import { createServerSupabase } from '../../../../lib/supabase-server'
import { createAdminSupabase } from '../../../../lib/supabase-admin'

// The signed-in agent's OWN seller-report tokens. report_token is not readable
// by the browser client (migration 070), so the dashboard gets it here. The
// service role is used only after the session is verified, and the query is
// hard-scoped to that user's id — never a client-supplied one.
export const dynamic = 'force-dynamic'

export async function GET() {
  const { data: { user } } = await createServerSupabase().auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await createAdminSupabase()
    .from('properties')
    .select('id, report_token')
    .eq('user_id', user.id)
  if (error) return NextResponse.json({ error: 'Could not load report links.' }, { status: 500 })

  const links: Record<string, string> = {}
  for (const r of data ?? []) links[r.id as string] = r.report_token as string
  return NextResponse.json({ links })
}
