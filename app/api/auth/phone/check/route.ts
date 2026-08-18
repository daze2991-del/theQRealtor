import { NextResponse } from 'next/server'
import { normalizePhone } from '../../../../../lib/phone'
import { checkPhoneVerification } from '../../../../../lib/twilio'
import { signPhoneVerifyToken } from '../../../../../lib/phoneVerifyToken'

export async function POST(req: Request) {
  const { phone, code } = await req.json()

  if (!phone || typeof phone !== 'string' || !phone.trim()) {
    return NextResponse.json({ error: 'A phone number is required.' }, { status: 400 })
  }
  const normalizedPhone = normalizePhone(phone)
  if (!normalizedPhone) {
    return NextResponse.json({ error: 'Please enter a valid phone number.' }, { status: 400 })
  }
  if (!code || typeof code !== 'string' || !code.trim()) {
    return NextResponse.json({ error: 'Enter the verification code.' }, { status: 400 })
  }

  const result = await checkPhoneVerification(normalizedPhone, code.trim())
  if (!result.approved) {
    return NextResponse.json({ approved: false, error: result.error ?? 'Incorrect code. Please try again.' }, { status: 400 })
  }

  // Signed proof-of-verification for beta-signup — Verify's check is one-time
  // (the code is consumed here), so beta-signup can't re-check with Twilio
  // itself and must trust this token instead.
  try {
    const token = signPhoneVerifyToken(normalizedPhone)
    return NextResponse.json({ approved: true, token })
  } catch (err: any) {
    console.error('[phone/check] failed to sign verification token:', err?.message)
    return NextResponse.json(
      { approved: false, error: 'Could not complete verification. Please try again.' },
      { status: 500 }
    )
  }
}
