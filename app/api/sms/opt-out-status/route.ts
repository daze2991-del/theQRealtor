// ── SMS opt-out status for the signed-in agent's dashboard ────────────────────
//
// GET only, no parameters. Returns the ids of the agent's OWN leads whose buyer
// has opted out of texts ("Texts off" badges + filter), and whether the agent's
// own alert number is opted out (the "alerts paused" banner).
//
// sms_contacts stays service-role only: it is read here on the agent's behalf,
// and nothing but lead ids and one boolean is returned — never a phone number,
// never another agent's data. Because no number can be passed in, this can't
// be used to look up the opt-out status of an arbitrary number.
//
// Display only: on any failure it returns 500 and the dashboard simply shows no
// badges. Sending is unaffected — lib/twilio.ts sendSmsDetailed() enforces
// suppression on its own.

import { NextResponse } from 'next/server'
import { createServerSupabase } from '../../../../lib/supabase-server'
import { createAdminSupabase } from '../../../../lib/supabase-admin'
import { getAgentOptOutStatus } from '../../../../lib/sms/optOutStatus'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

export async function GET() {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE })
  }

  try {
    const status = await getAgentOptOutStatus({ rls: supabase, admin: createAdminSupabase(), agentId: user.id })
    return NextResponse.json(status, { headers: NO_STORE })
  } catch (err: any) {
    console.error('[sms/opt-out-status] lookup failed:', err?.message)
    return NextResponse.json({ error: 'Lookup failed' }, { status: 500, headers: NO_STORE })
  }
}
