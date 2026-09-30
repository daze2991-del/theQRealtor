import { NextResponse } from 'next/server'
import { sendSmsDetailed, smsConfigured } from '../../../lib/twilio'
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

  // Kept as its own check so this route can keep returning its specific
  // "not configured" message before attempting anything.
  if (!smsConfigured()) {
    return NextResponse.json({ error: 'SMS is not configured on this server.' }, { status: 500 })
  }

  // sendSmsDetailed() never throws and doesn't surface Twilio's own error text
  // (it's logged server-side under '[twilio]'), so an ordinary send failure is
  // reported generically. Opt-out suppression gets its own messages, because
  // the fix is in the agent's hands: text START.
  const result = await sendSmsDetailed(phone, '✅ theqrealtor test — your SMS lead alerts are working correctly!')
  if (result.sent) return NextResponse.json({ ok: true })

  if (result.suppressed && (result.reason === 'opted_out' || result.reason === 'twilio_blocked')) {
    return NextResponse.json({ error: TEXTS_PAUSED_MESSAGE }, { status: 409 })
  }
  if (result.suppressed && result.reason === 'check_failed') {
    return NextResponse.json({ error: "Couldn't send right now — please try again in a minute." }, { status: 503 })
  }
  return NextResponse.json({ error: 'Failed to send SMS.' }, { status: 500 })
}

const TEXTS_PAUSED_MESSAGE =
  'Texts to this number are paused because it replied STOP. Text START to (620) 522-8398 to turn them back on.'
