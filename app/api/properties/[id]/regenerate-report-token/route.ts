import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { createServerSupabase } from '../../../../../lib/supabase-server'

// Rotate a property's seller-report token, invalidating any previously shared
// /report/{token} link immediately (the old token stops matching any row).
//
// OWNERSHIP: deliberately uses the SESSION-scoped client, never the service
// role. Two independent guards, both required:
//   1. RLS — "properties are owned by profile" (migration 001) constrains this
//      UPDATE to rows where auth.uid() = user_id.
//   2. The explicit .eq('user_id', user.id) below, so a future RLS policy
//      regression cannot silently widen this endpoint into a cross-tenant
//      token-reset primitive.
// A request for another agent's property matches zero rows and 404s.
export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Generated in-process rather than via a DB default so the write stays a
  // plain RLS-checked UPDATE. randomUUID() is CSPRNG-backed (node:crypto).
  const nextToken = randomUUID()

  const { data, error } = await supabase
    .from('properties')
    .update({ report_token: nextToken })
    .eq('id', params.id)
    .eq('user_id', user.id)
    .select('id, report_token')
    .single()

  if (error || !data) {
    // Same response for "doesn't exist" and "not yours" — don't confirm the
    // existence of another agent's property id.
    return NextResponse.json({ error: 'Property not found.' }, { status: 404 })
  }

  return NextResponse.json({ ok: true, report_token: data.report_token })
}
