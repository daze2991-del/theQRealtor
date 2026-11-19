import { NextResponse } from 'next/server'
import { normalizePhone } from '../../../../../lib/phone'
import { startPhoneVerification } from '../../../../../lib/twilio'
import { isInvitedEmail } from '../../../../../lib/inviteGate'
import { INVITE_ONLY_MESSAGE } from '../../../../../lib/inviteCopy'
import { createAdminSupabase } from '../../../../../lib/supabase-admin'
import { clientIp, reserveIpRequest, reserveVerificationCode } from '../../../../../lib/smsLimits'

const TOO_MANY = 'Too many attempts, try again later.'
const CANT_NOW = "Couldn't send a code right now. Please try again in a minute."

function limitResponse(reason: string) {
  return reason === 'check_failed'
    ? NextResponse.json({ error: CANT_NOW }, { status: 503 })
    : NextResponse.json({ error: TOO_MANY }, { status: 429 })
}

export async function POST(req: Request) {
  // Durable per-IP cap (10/hour), counted from the database. Fails closed.
  const admin = createAdminSupabase()
  const ipDecision = await reserveIpRequest(admin, 'send_code_request', clientIp(req))
  if (!ipDecision.ok) return limitResponse(ipDecision.reason)

  const { phone, email } = await req.json().catch(() => ({} as { phone?: unknown; email?: unknown }))

  // Invite check FIRST, server-side: a non-invited (or missing/malformed) email
  // must never cause a verification SMS to be sent, whatever the UI did. The
  // answer is deliberately the same generic message either way.
  if (!(await isInvitedEmail(email))) {
    return NextResponse.json({ error: INVITE_ONLY_MESSAGE, inviteOnly: true }, { status: 403 })
  }

  if (!phone || typeof phone !== 'string' || !phone.trim()) {
    return NextResponse.json({ error: 'A phone number is required.' }, { status: 400 })
  }
  const normalizedPhone = normalizePhone(phone)
  if (!normalizedPhone) {
    return NextResponse.json({ error: 'Please enter a valid phone number.' }, { status: 400 })
  }

  // Durable per-number cap (5 codes/day, shared by every route), checked and
  // logged BEFORE Twilio is called so failed sends count too. Fails closed.
  const phoneDecision = await reserveVerificationCode(admin, { phoneE164: normalizedPhone })
  if (!phoneDecision.ok) return limitResponse(phoneDecision.reason)

  const result = await startPhoneVerification(normalizedPhone)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 })
  }

  return NextResponse.json({ ok: true })
}
