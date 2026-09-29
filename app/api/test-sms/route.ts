import { NextResponse } from 'next/server'
import { sendSms, smsConfigured } from '../../../lib/twilio'
import { createServerSupabase } from '../../../lib/supabase-server'

export async function POST() {
  const serverSupabase = createServerSupabase()
  const { data: { user } } = await serverSupabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const meta = user.user_metadata || {}
  const phone = (meta.phone as string | undefined)?.trim()

  if (!phone) {
    return NextResponse.json(
      { error: 'No phone number saved. Add your phone number in Settings first.' },
      { status: 400 }
    )
  }

  // Kept as its own check (rather than relying solely on sendSms()'s internal
  // one) so this route can keep returning its specific "not configured"
  // message. sendSms() fails safe on missing config too — logs a warning and
  // returns null — but that collapses into the exact same null a real send
  // failure returns, and this button wants to tell those two apart.
  if (!smsConfigured()) {
    return NextResponse.json({ error: 'SMS is not configured on this server.' }, { status: 500 })
  }

  // sendSms() never throws and swallows the underlying Twilio error (only
  // console.error-logs it, under the '[twilio]' tag rather than '[test-sms]')
  // — so a real send failure here can only be reported generically, not with
  // Twilio's specific error message the way the old direct-client code could.
  const sid = await sendSms(phone, '✅ theqrealtor test — your SMS lead alerts are working correctly!')
  if (!sid) {
    return NextResponse.json({ error: 'Failed to send SMS.' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
