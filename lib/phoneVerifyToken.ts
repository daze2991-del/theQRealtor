// ── Phone-verification token ─────────────────────────────────────────────────
// Proves to beta-signup that a phone number recently passed Twilio Verify,
// without beta-signup having to re-check with Twilio (verificationChecks are
// one-time — a code is consumed on its first successful check, so it can't be
// re-checked from a second endpoint). Short-lived and single-purpose: it only
// carries {phone, exp}, signed with a server-only secret so it can't be forged
// by a client calling beta-signup directly without ever completing Verify.

import { createHmac, timingSafeEqual } from 'crypto'

const TOKEN_TTL_MS = 10 * 60_000 // 10 minutes

function sign(payloadB64: string): string {
  const secret = process.env.PHONE_VERIFY_SECRET
  if (!secret) throw new Error('PHONE_VERIFY_SECRET is not configured')
  return createHmac('sha256', secret).update(payloadB64).digest('base64url')
}

export function signPhoneVerifyToken(phone: string): string {
  const payload = JSON.stringify({ phone, exp: Date.now() + TOKEN_TTL_MS })
  const payloadB64 = Buffer.from(payload).toString('base64url')
  return `${payloadB64}.${sign(payloadB64)}`
}

export function verifyPhoneVerifyToken(token: string | null | undefined, phone: string): boolean {
  if (!token || typeof token !== 'string') return false
  const [payloadB64, sig] = token.split('.')
  if (!payloadB64 || !sig) return false

  let expectedSig: string
  try {
    expectedSig = sign(payloadB64)
  } catch {
    return false // PHONE_VERIFY_SECRET not configured — fail closed
  }

  const sigBuf = Buffer.from(sig)
  const expectedBuf = Buffer.from(expectedSig)
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) return false

  let payload: { phone?: string; exp?: number }
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'))
  } catch {
    return false
  }

  if (!payload.phone || !payload.exp) return false
  if (Date.now() > payload.exp) return false
  if (payload.phone !== phone) return false

  return true
}
