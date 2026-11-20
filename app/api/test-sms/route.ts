import { NextResponse } from 'next/server'
import { sendSmsDetailed, smsConfigured } from '../../../lib/twilio'
import { createServerSupabase } from '../../../lib/supabase-server'
import { createAdminSupabase } from '../../../lib/supabase-admin'
import { TEST_SMS_DAILY_CAP, TEST_SMS_MESSAGE } from '../../../lib/testSms'
import { withErrorAlerts } from '../../../lib/errorAlerts'

// Durable per-agent daily cap, counted from public.sms_send_log (alert_type
// 'test'), so it holds across serverless instances — unlike the in-memory
// per-IP limiters elsewhere in the app, which reset on every cold start.
async function POST__handler() {
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
  // Cap check + log happen BEFORE the send and count attempts, not successes,
  // so repeated failures can't be used to hammer Twilio either. Fails closed.
  const admin = createAdminSupabase()
  const todayStart = new Date()
  todayStart.setUTCHours(0, 0, 0, 0)
  const { count, error: countError } = await admin
    .from('sms_send_log')
    .select('*', { count: 'exact', head: true })
    .eq('agent_id', user.id)
    .eq('alert_type', 'test')
    .gte('created_at', todayStart.toISOString())
  if (countError) {
    return NextResponse.json({ error: "Couldn't send right now — please try again in a minute." }, { status: 503 })
  }
  if ((count ?? 0) >= TEST_SMS_DAILY_CAP) {
    return NextResponse.json(
      { error: `You've reached today's limit of ${TEST_SMS_DAILY_CAP} test texts. Try again tomorrow.` },
      { status: 429 }
    )
  }
  const { error: logError } = await admin.from('sms_send_log').insert({ agent_id: user.id, alert_type: 'test' })
  if (logError) {
    return NextResponse.json({ error: "Couldn't send right now — please try again in a minute." }, { status: 503 })
  }

  const result = await sendSmsDetailed(phone, TEST_SMS_MESSAGE)
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

export const POST = withErrorAlerts('/api/test-sms', POST__handler)
