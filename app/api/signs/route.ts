import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { createAdminSupabase } from '@/lib/supabase-admin'

type AssignmentRow = {
  id: string
  property_id: string
  assigned_at: string
  unassigned_at: string | null
  properties: { id: string; address: string; city: string | null; state: string | null } | null
}

type SignRow = {
  id: string
  label: string
  created_at: string
  sign_assignments: AssignmentRow[]
}

// All signs for the calling agent, each with its current active assignment
// (unassigned_at IS NULL) and full assignment history, newest first.
export async function GET() {
  const supabase = createServerSupabase()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminSupabase()
  const { data, error } = await admin
    .from('signs')
    .select('id, label, created_at, sign_assignments(id, property_id, assigned_at, unassigned_at, properties(id, address, city, state))')
    .eq('agent_id', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[signs] list error:', error)
    return NextResponse.json({ error: 'Failed to load signs. Please try again.' }, { status: 500 })
  }

  const signs = ((data ?? []) as unknown as SignRow[]).map(sign => {
    const history = [...(sign.sign_assignments ?? [])].sort(
      (a, b) => new Date(b.assigned_at).getTime() - new Date(a.assigned_at).getTime()
    )
    const current = history.find(a => a.unassigned_at === null) ?? null
    return {
      id: sign.id,
      label: sign.label,
      created_at: sign.created_at,
      current_assignment: current,
      history,
    }
  })

  return NextResponse.json({ signs })
}
