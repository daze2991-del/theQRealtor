import { NextResponse } from 'next/server'
import twilio from 'twilio'
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

  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken  = process.env.TWILIO_AUTH_TOKEN
  const fromNumber = process.env.TWILIO_PHONE_NUMBER

  if (!accountSid || !authToken || !fromNumber) {
    return NextResponse.json({ error: 'SMS is not configured on this server.' }, { status: 500 })
  }

  try {
    const client = twilio(accountSid, authToken)
    await client.messages.create({
      body: '✅ theqrealtor test — your SMS lead alerts are working correctly!',
      from: fromNumber,
      to: phone,
    })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[test-sms] twilio error:', err?.message)
    return NextResponse.json({ error: err?.message || 'Failed to send SMS.' }, { status: 500 })
  }
}
