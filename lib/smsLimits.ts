import { createHash } from 'crypto'

// Durable SMS caps, counted from public.sms_rate_events (migration 071) so they
// hold across serverless instances. Every function here NEVER throws and fails
// CLOSED: if the table can't be written or read, the answer is "not ok" and the
// caller skips the text (the lead is still saved by the caller).
//
// Each attempt inserts its own row FIRST, then counts the allowed rows in the
// window including itself. Concurrent bursts therefore see each other and can
// only over-deny, never over-allow. A refused attempt is flipped to
// allowed=false and stops counting.

export const SMS_LIMITS = {
  buyerConfirmationsPerPhonePerDay: 3,
  verificationCodesPerPhonePerDay: 5,
  buyerConfirmationsPerListingPerDay: 50,
  requestsPerIpPerHour: 10,
  // Lead-form flood caps (Batch 4 follow-up).
  leadSubmissionsPerIpPerHour: 20,       // across all listings; over it the lead is NOT saved
  leadsPerListingPerHour: 30,            // all IPs; over it the lead IS saved but no agent SMS
  agentAlertsPerAgentPerHour: 20,        // across all listings; extras go to dashboard + email only
} as const

const DAY_MS = 24 * 60 * 60_000
const HOUR_MS = 60 * 60_000

export type LimitReason = 'phone_cap' | 'listing_cap' | 'ip_cap' | 'agent_cap' | 'check_failed'
export type LimitDecision = { ok: true } | { ok: false; reason: LimitReason }

// Loose on purpose: both the real admin client and the test fake satisfy it.
type Admin = { from: (table: string) => any }

const hash = (v: string) => createHash('sha256').update(v).digest('hex')

/**
 * Client IP from Vercel's trusted headers. Vercel sets x-vercel-forwarded-for
 * itself and overwrites anything the client sent; the generic x-forwarded-for
 * is deliberately NOT read, because off-Vercel it is client-controlled. Without
 * a trusted header everything shares one 'unknown' bucket (strictest outcome).
 */
export function clientIp(request: Request): string {
  const raw = request.headers.get('x-vercel-forwarded-for') ?? request.headers.get('x-real-ip') ?? ''
  return raw.split(',')[0].trim() || 'unknown'
}

interface Check { column: 'phone_hash' | 'listing_id' | 'ip_hash' | 'agent_id'; value: string; windowMs: number; cap: number; reason: LimitReason }

async function reserve(
  admin: Admin,
  kind: string,
  row: { phone_hash?: string; listing_id?: string; ip_hash?: string; agent_id?: string },
  checks: Check[],
): Promise<LimitDecision> {
  let id: string | undefined
  try {
    const ins = await admin.from('sms_rate_events').insert({ kind, ...row, allowed: true }).select('id').single()
    if (ins.error || !ins.data?.id) {
      console.error('[smsLimits] log insert failed:', ins.error?.message)
      return { ok: false, reason: 'check_failed' }
    }
    id = ins.data.id as string

    for (const c of checks) {
      const since = new Date(Date.now() - c.windowMs).toISOString()
      const { count, error } = await admin
        .from('sms_rate_events')
        .select('*', { count: 'exact', head: true })
        .eq('kind', kind)
        .eq(c.column, c.value)
        .eq('allowed', true)
        .gte('created_at', since)
      if (error || typeof count !== 'number') {
        console.error('[smsLimits] count failed:', error?.message)
        await refuse(admin, id)
        return { ok: false, reason: 'check_failed' }
      }
      if (count > c.cap) {
        await refuse(admin, id)
        return { ok: false, reason: c.reason }
      }
    }
    return { ok: true }
  } catch (err: any) {
    console.error('[smsLimits] unexpected error:', err?.message ?? err)
    if (id) await refuse(admin, id)
    return { ok: false, reason: 'check_failed' }
  }
}

async function refuse(admin: Admin, id: string) {
  try { await admin.from('sms_rate_events').update({ allowed: false }).eq('id', id) } catch { /* best effort */ }
}

/** Per client IP, per route: at most 10 requests per hour. */
export function reserveIpRequest(admin: Admin, route: 'lead_request' | 'send_code_request', ip: string) {
  const ip_hash = hash(ip)
  return reserve(admin, route, { ip_hash }, [
    { column: 'ip_hash', value: ip_hash, windowMs: HOUR_MS, cap: SMS_LIMITS.requestsPerIpPerHour, reason: 'ip_cap' },
  ])
}

/** Buyer confirmation text: per destination phone (3/day) and per listing (50/day). */
export function reserveBuyerConfirmation(admin: Admin, a: { phoneE164: string; listingId: string }) {
  const phone_hash = hash(a.phoneE164)
  return reserve(admin, 'buyer_confirmation', { phone_hash, listing_id: a.listingId }, [
    { column: 'phone_hash', value: phone_hash, windowMs: DAY_MS, cap: SMS_LIMITS.buyerConfirmationsPerPhonePerDay, reason: 'phone_cap' },
    { column: 'listing_id', value: a.listingId, windowMs: DAY_MS, cap: SMS_LIMITS.buyerConfirmationsPerListingPerDay, reason: 'listing_cap' },
  ])
}

/** Verification code: per destination phone, at most 5 per day. */
export function reserveVerificationCode(admin: Admin, a: { phoneE164: string }) {
  const phone_hash = hash(a.phoneE164)
  return reserve(admin, 'verification_code', { phone_hash }, [
    { column: 'phone_hash', value: phone_hash, windowMs: DAY_MS, cap: SMS_LIMITS.verificationCodesPerPhonePerDay, reason: 'phone_cap' },
  ])
}

/** Lead-form flood cap: per client IP across ALL listings, at most 20 submissions per hour. */
export function reserveLeadSubmission(admin: Admin, ip: string) {
  const ip_hash = hash(ip)
  return reserve(admin, 'lead_submission', { ip_hash }, [
    { column: 'ip_hash', value: ip_hash, windowMs: HOUR_MS, cap: SMS_LIMITS.leadSubmissionsPerIpPerHour, reason: 'ip_cap' },
  ])
}

/** Per listing, all IPs: at most 30 leads per hour may trigger an agent SMS. */
export function reserveListingLead(admin: Admin, listingId: string) {
  return reserve(admin, 'lead_listing', { listing_id: listingId }, [
    { column: 'listing_id', value: listingId, windowMs: HOUR_MS, cap: SMS_LIMITS.leadsPerListingPerHour, reason: 'listing_cap' },
  ])
}

/** Agent alert texts: at most 20 per agent per hour across all listings. */
export function reserveAgentAlert(admin: Admin, agentId: string) {
  return reserve(admin, 'agent_alert', { agent_id: agentId }, [
    { column: 'agent_id', value: agentId, windowMs: HOUR_MS, cap: SMS_LIMITS.agentAlertsPerAgentPerHour, reason: 'agent_cap' },
  ])
}
