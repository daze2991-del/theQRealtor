// ── Twilio SMS helpers ────────────────────────────────────────────────────────
// Centralizes outbound sending, agent-local quiet-hours math, quiet-hours
// queueing, and the message templates used by the lead/notification flows.
// Server-side only — uses the Twilio REST API and the Supabase admin client.

import twilio from 'twilio'
import { createAdminSupabase } from './supabase-admin'
import { normalizePhone } from './phone'

type Admin = ReturnType<typeof createAdminSupabase>

export const DEFAULT_TZ = 'America/Los_Angeles'

// ── URLs ──────────────────────────────────────────────────────────────────────
export function siteUrl(): string {
  const u = process.env.NEXT_PUBLIC_APP_URL
  if (u && u.startsWith('https://')) return u.replace(/\/$/, '')
  return 'https://theqrealtor.com'
}

export function leadUrl(leadId: string): string {
  return `${siteUrl()}/dashboard/leads/${leadId}`
}

export function billingUrl(): string {
  return `${siteUrl()}/dashboard/billing`
}

// ── Sending ───────────────────────────────────────────────────────────────────
// Sent via the Messaging Service (TWILIO_MESSAGING_SERVICE_SID), not a bare
// `from:` number — the Messaging Service's sender pool replaces the single
// TWILIO_PHONE_NUMBER sender this used before, and Advanced Opt-Out (STOP/HELP
// handling on Twilio's side) is a Messaging Service feature only, so `from:`
// never engaged it. The app-level side of opt-out is enforced in
// sendSmsDetailed() below (see "Opt-out suppression"); opt-outs are recorded
// by app/api/sms/inbound/route.ts.
export function smsConfigured(): boolean {
  return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_MESSAGING_SERVICE_SID)
}

// ── Opt-out suppression ───────────────────────────────────────────────────────
// public.sms_contacts is the source of truth for SMS consent (written by
// app/api/sms/inbound). EVERY outbound text passes through the check below
// before Twilio is called: an opted-out number is never texted. This is what
// enforces freeform opt-outs ("please stop texting me"), which Twilio's
// Advanced Opt-Out does not see; keyword opt-outs are also blocked by Twilio
// itself (error 21610).
//
// The check FAILS CLOSED: if the lookup errors, nothing is sent. Missing a
// text is recoverable; texting someone who opted out is not.

export type SmsSuppressionReason = 'invalid_number' | 'opted_out' | 'check_failed' | 'twilio_blocked'
export type SmsFailureReason = 'not_configured' | 'no_destination' | 'send_failed'

/**
 * Result of sendSmsDetailed(). Discriminate on `sent`, then `suppressed`:
 *   • sent: true                   — Twilio accepted it; `sid` is the message SID.
 *     `from` is the sending number as Twilio reported it at creation. With a
 *     Messaging Service Twilio picks the sender from the pool AFTER accepting
 *     the message (status 'accepted' → 'queued'), so this is usually null.
 *   • sent: false, suppressed: true — deliberately NOT sent (opted out,
 *     unusable number, consent check failed, or blocked by Twilio). Retrying
 *     won't help, except for reason 'check_failed', which is transient.
 *   • sent: false, suppressed: false — not sent for an operational reason
 *     (Twilio not configured, no destination, Twilio/network error).
 */
export type SendSmsResult =
  | { sent: true; suppressed: false; sid: string; from: string | null }
  | { sent: false; suppressed: true; reason: SmsSuppressionReason }
  | { sent: false; suppressed: false; reason: SmsFailureReason; errorCode?: string | number }

const E164 = /^\+[1-9][0-9]{7,14}$/

/** Last 4 digits only — never log a full phone number. */
export function maskPhone(phone: string | null | undefined): string {
  return '***-***-' + ((phone ?? '').replace(/\D/g, '').slice(-4) || '****')
}

/** E.164 form of `to`, or null if it can't be made into one. */
function toE164(to: string): string | null {
  const trimmed = to.trim()
  return normalizePhone(trimmed) ?? (E164.test(trimmed) ? trimmed : null)
}

/**
 * Opt-out gate on its own, for callers that need to know BEFORE doing other
 * work (e.g. deciding whether to queue a quiet-hours alert). sendSmsDetailed()
 * always runs it again right before sending, so a queued text is re-checked
 * at the moment it actually goes out.
 */
export async function checkSmsSuppression(
  to: string,
): Promise<{ suppressed: false; toE164: string } | { suppressed: true; reason: SmsSuppressionReason }> {
  const e164 = toE164(to)
  if (!e164) {
    console.warn('[twilio] SMS_SUPPRESSED invalid_number |', maskPhone(to))
    return { suppressed: true, reason: 'invalid_number' }
  }

  const { data, error } = await createAdminSupabase()
    .from('sms_contacts')
    .select('status')
    .eq('phone_e164', e164)
    .maybeSingle()
  if (error) {
    console.error('[twilio] SMS_SUPPRESSION_CHECK_FAILED |', maskPhone(e164), '|', error.message)
    return { suppressed: true, reason: 'check_failed' }
  }
  if (data?.status === 'opted_out') {
    console.warn('[twilio] SMS_SUPPRESSED opted_out |', maskPhone(e164))
    return { suppressed: true, reason: 'opted_out' }
  }
  // 'opted_in', or no row (never opted out).
  return { suppressed: false, toE164: e164 }
}

// Never throws — SMS failures must never block lead capture.
export async function sendSmsDetailed(to: string | null | undefined, body: string): Promise<SendSmsResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID
  if (!sid || !token || !messagingServiceSid) {
    console.warn('[twilio] not configured — skipping send')
    return { sent: false, suppressed: false, reason: 'not_configured' }
  }
  if (!to || !to.trim()) {
    console.warn('[twilio] no destination — skipping send')
    return { sent: false, suppressed: false, reason: 'no_destination' }
  }

  const gate = await checkSmsSuppression(to)
  if (gate.suppressed) return { sent: false, suppressed: true, reason: gate.reason }

  try {
    // Send to exactly the number that was checked.
    const msg = await twilio(sid, token).messages.create({ to: gate.toE164, messagingServiceSid, body })
    console.log('[twilio] sent', msg.sid, '|', msg.status, '→', maskPhone(gate.toE164))
    return { sent: true, suppressed: false, sid: msg.sid, from: msg.from ?? null }
  } catch (err: any) {
    if (Number(err?.code) === 21610) {
      // Recipient replied STOP at the Twilio level (keyword opt-out).
      console.warn('[twilio] SMS_BLOCKED_BY_TWILIO_21610 |', maskPhone(gate.toE164))
      return { sent: false, suppressed: true, reason: 'twilio_blocked' }
    }
    console.error('[twilio] send error — code:', err?.code, '| message:', err?.message, '| to:', maskPhone(gate.toE164))
    return { sent: false, suppressed: false, reason: 'send_failed', errorCode: err?.code }
  }
}

// Backward-compatible wrapper: the message SID on a real send, otherwise null
// (suppressed, skipped or failed). Callers that need to know WHY a text didn't
// go out use sendSmsDetailed(). This must stay string | null — callers do
// `if (sid)`, and an object here would be truthy even for a suppressed send.
export async function sendSms(to: string | null | undefined, body: string): Promise<string | null> {
  const result = await sendSmsDetailed(to, body)
  return result.sent ? result.sid : null
}

// ── Phone verification (Twilio Verify) ────────────────────────────────────────
// Verify holds its own pending-code state on Twilio's side — no local table
// needed. Uses the Verify Service (TWILIO_VERIFY_SERVICE_SID), a separate
// resource from the Messaging Service (TWILIO_MESSAGING_SERVICE_SID) used by
// sendSms() above.
export function verifyConfigured(): boolean {
  return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_VERIFY_SERVICE_SID)
}

export async function startPhoneVerification(to: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  const verifySid = process.env.TWILIO_VERIFY_SERVICE_SID
  if (!sid || !token || !verifySid) {
    console.warn('[twilio verify] not configured — skipping send')
    return { ok: false, error: 'Phone verification is not available right now.' }
  }
  try {
    const verification = await twilio(sid, token).verify.v2.services(verifySid).verifications.create({ to, channel: 'sms' })
    console.log('[twilio verify] sent', verification.sid, '|', verification.status, '→', to)
    return { ok: true }
  } catch (err: any) {
    console.error('[twilio verify] send error — code:', err?.code, '| message:', err?.message)
    // 60203 = Twilio's own max-send-attempts throttle for this destination number
    if (err?.code === 60203) {
      return { ok: false, error: 'Too many code requests for this number. Please try again later.' }
    }
    return { ok: false, error: 'Could not send verification code. Please check the number and try again.' }
  }
}

export async function checkPhoneVerification(to: string, code: string): Promise<{ approved: boolean; error?: string }> {
  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  const verifySid = process.env.TWILIO_VERIFY_SERVICE_SID
  if (!sid || !token || !verifySid) {
    console.warn('[twilio verify] not configured — skipping check')
    return { approved: false, error: 'Phone verification is not available right now.' }
  }
  try {
    const check = await twilio(sid, token).verify.v2.services(verifySid).verificationChecks.create({ to, code })
    console.log('[twilio verify] check', check.sid, '|', check.status, '→', to)
    if (check.status === 'approved') return { approved: true }
    return { approved: false, error: 'Incorrect code. Please try again.' }
  } catch (err: any) {
    console.error('[twilio verify] check error — code:', err?.code, '| message:', err?.message)
    // 20404 = no pending verification for this number (expired or already used)
    if (err?.code === 20404) {
      return { approved: false, error: 'That code has expired. Please request a new one.' }
    }
    return { approved: false, error: 'Could not verify code. Please try again.' }
  }
}

// ── Agent phone resolution ────────────────────────────────────────────────────
// profiles.phone is the source of truth; fall back to the agent_phone synced onto
// their properties (older accounts that predate profiles.phone).
export async function resolveAgentPhone(admin: Admin, agentId: string | null | undefined): Promise<string | null> {
  if (!agentId) return null
  const { data: prof } = await admin.from('profiles').select('phone').eq('id', agentId).single()
  if (prof?.phone && String(prof.phone).trim()) return String(prof.phone).trim()
  const { data: props } = await admin
    .from('properties').select('agent_phone').eq('user_id', agentId)
    .not('agent_phone', 'is', null).limit(1)
  const p = props?.[0]?.agent_phone
  return p && String(p).trim() ? String(p).trim() : null
}

// ── Quiet hours ───────────────────────────────────────────────────────────────
// Agent-local wall-clock for a UTC instant.
function localMinutes(at: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false, hour: '2-digit', minute: '2-digit' })
  const parts = dtf.formatToParts(at)
  const h = Number(parts.find(p => p.type === 'hour')?.value ?? '0') % 24
  const m = Number(parts.find(p => p.type === 'minute')?.value ?? '0')
  return h * 60 + m
}

// 'HH:MM' or 'HH:MM:SS' → minutes since midnight
function hmToMinutes(t: string): number {
  const [h, m] = (t || '0:0').split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

// True when the agent-local time falls inside [start, end). Windows that wrap
// past midnight (e.g. 21:00 → 08:00) are handled.
export function isQuietHours(at: Date, startT: string, endT: string, tz: string = DEFAULT_TZ): boolean {
  const cur = localMinutes(at, tz)
  const start = hmToMinutes(startT)
  const end = hmToMinutes(endT)
  if (start === end) return false
  if (start < end) return cur >= start && cur < end
  return cur >= start || cur < end
}

// ms to add to a UTC instant to get the agent-local wall-clock (as if it were UTC).
function tzOffsetMs(at: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const p: Record<string, string> = {}
  for (const part of dtf.formatToParts(at)) p[part.type] = part.value
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second)
  return asUTC - at.getTime()
}

// Next UTC instant matching the agent-local end-of-quiet time (e.g. 08:00 local).
// DST transition edges (twice a year) are approximated — acceptable for a
// "hold until morning" delivery window.
export function nextSendTime(at: Date, endT: string, tz: string = DEFAULT_TZ): Date {
  const endMin = hmToMinutes(endT)
  const endH = Math.floor(endMin / 60), endM = endMin % 60
  const offset = tzOffsetMs(at, tz)
  const localNow = new Date(at.getTime() + offset) // wall-clock as if UTC
  let candidate = Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate(), endH, endM)
  if (candidate <= localNow.getTime()) candidate += 86_400_000
  return new Date(candidate - offset)
}

// ── Agent alert dispatch (quiet-hours aware) ──────────────────────────────────
export interface AgentNotifyProfile {
  id: string
  quiet_hours_enabled: boolean
  quiet_hours_start: string
  quiet_hours_end: string
}

// Logs each dispatched agent alert and fires a one-time founder alarm at 100/day.
// Non-blocking on failures — SMS delivery must never depend on this path.
async function logAndMaybeAlarm(admin: Admin, agentId: string, alertType: string): Promise<void> {
  const { error: insertError } = await admin
    .from('sms_send_log')
    .insert({ agent_id: agentId, alert_type: alertType })
  if (insertError) {
    console.error('[twilio] sms_send_log insert failed:', insertError.message)
    return
  }

  const todayStart = new Date()
  todayStart.setUTCHours(0, 0, 0, 0)
  const { count, error: countError } = await admin
    .from('sms_send_log')
    .select('*', { count: 'exact', head: true })
    .eq('agent_id', agentId)
    .gte('created_at', todayStart.toISOString())
  if (countError) {
    console.error('[twilio] sms_send_log count failed:', countError.message)
    return
  }

  // Fire once at exactly 100. Minor race: two concurrent requests could both see
  // count 100 and both fire — acceptable for a monitoring-only tool.
  if (count === 100) {
    const adminPhone = process.env.ADMIN_PHONE_NUMBER
    if (!adminPhone) {
      console.warn('[twilio] ADMIN_PHONE_NUMBER not set — skipping founder alarm')
      return
    }
    const { data: prof } = await admin
      .from('profiles')
      .select('name')
      .eq('id', agentId)
      .maybeSingle()
    const agentLabel = (prof?.name as string | null)?.trim() || agentId
    await sendSms(adminPhone, `⚠️ Agent ${agentLabel} has sent 100+ SMS alerts today — check for a viral listing or anomaly.`)
  }
}

// Sends immediately, or queues into pending_notifications when inside quiet hours
// (held, not dropped — the cron flush sends it at quiet_hours_end).
//
// Only a text that actually went out (or was queued to go out) counts toward
// the sms_send_log founder alarm — a suppressed or failed send never does.
//   'sent'       — Twilio accepted it; counted.
//   'queued'     — held for quiet hours; counted at queue time (as before).
//                  The flush re-checks opt-out when it actually sends.
//   'suppressed' — agent's number is opted out / unusable; not queued, not counted.
//   'failed'     — Twilio/config error; not counted.
//   'skipped'    — no agent phone on file.
export async function queueOrSendAgentSms(opts: {
  admin: Admin
  agent: AgentNotifyProfile
  agentPhone: string | null
  leadId: string
  message: string
  alertType: string
  now?: Date
}): Promise<'sent' | 'queued' | 'skipped' | 'suppressed' | 'failed'> {
  const { admin, agent, agentPhone, leadId, message } = opts
  const now = opts.now ?? new Date()
  if (!agentPhone) return 'skipped'

  // Master toggle checked BEFORE the time-window predicate — when off, this
  // short-circuits straight past isQuietHours() regardless of what the time
  // fields hold, so a stale/default 21:00-08:00 window can never hold a
  // message while the agent has explicitly disabled quiet hours.
  if (agent.quiet_hours_enabled && isQuietHours(now, agent.quiet_hours_start, agent.quiet_hours_end)) {
    // Don't queue for a number that has definitively opted out (or can't be
    // texted). A consent-check FAILURE still queues: the flush re-checks, and
    // fails closed there, so a transient DB error can't lose the alert.
    const gate = await checkSmsSuppression(agentPhone)
    if (gate.suppressed && gate.reason !== 'check_failed') return 'suppressed'

    const scheduledFor = nextSendTime(now, agent.quiet_hours_end)
    const { error } = await admin.from('pending_notifications').insert({
      agent_id: agent.id, lead_id: leadId, message,
      scheduled_for: scheduledFor.toISOString(),
    })
    if (error) console.error('[twilio] queue error:', error.message)
    console.log('[twilio] queued for', scheduledFor.toISOString(), '(quiet hours)')
    await logAndMaybeAlarm(admin, agent.id, opts.alertType)
    return 'queued'
  }

  const result = await sendSmsDetailed(agentPhone, message)
  if (!result.sent) return result.suppressed ? 'suppressed' : 'failed'
  await logAndMaybeAlarm(admin, agent.id, opts.alertType)
  return 'sent'
}

// ── Due-notification flush ────────────────────────────────────────────────────
// Sends pending_notifications whose scheduled_for has passed and stamps
// sent_at, same idempotent shape as the daily cron (app/api/cron/
// flush-notifications). Shared so an agent-scoped opportunistic flush (a new
// lead coming in for them, or their own dashboard load) and the global cron
// backstop can't drift apart into two copies of the same loop.
//
// agentId narrows to one agent's due rows — cheap, since
// pending_notifications_due_idx (on scheduled_for where sent_at is null)
// covers the scan and the .eq('agent_id', …) filter is applied on top of it.
// Omit agentId for the global sweep the cron job runs.
// A send that genuinely failed (Twilio error, bad credentials, unreachable
// number) is left unsent so the next flush retries it. That retry has to be
// bounded, though, or a permanently undeliverable row is reattempted forever
// and — because the query is ordered oldest-first under a LIMIT — a pile of
// them would crowd newer, deliverable messages out of every batch. After this
// long past its scheduled time we give up and stamp it, with a loud log.
const ABANDON_AFTER_MS = 3 * 86_400_000 // 3 days

export async function flushDueNotifications(
  admin: Admin,
  opts: { agentId?: string; limit?: number } = {}
): Promise<{ processed: number; sent: number; failed: number; abandoned: number; suppressed: number; error?: string }> {
  const now = new Date()
  const nowIso = now.toISOString()

  let query = admin
    .from('pending_notifications')
    .select('id, agent_id, message, scheduled_for')
    .is('sent_at', null)
    .lte('scheduled_for', nowIso)
    .order('scheduled_for', { ascending: true })
    .limit(opts.limit ?? 100)
  if (opts.agentId) query = query.eq('agent_id', opts.agentId)

  // Never throws — this runs on paths (lead submission, dashboard load) that
  // must not fail because a notification flush had trouble. Callers that want
  // the failure surfaced (the cron route) can check the returned `error`.
  const { data: due, error } = await query
  if (error) {
    console.error('[twilio] flushDueNotifications query error:', error.message)
    return { processed: 0, sent: 0, failed: 0, abandoned: 0, suppressed: 0, error: error.message }
  }

  const markSent = (id: string) =>
    admin.from('pending_notifications').update({ sent_at: new Date().toISOString() }).eq('id', id)

  let sent = 0, failed = 0, abandoned = 0, suppressed = 0
  for (const n of due ?? []) {
    // Defense-in-depth: the Hot-lead SMS alert is removed (final decision,
    // nothing queues one anymore — see app/api/submit-lead/route.ts), but if a
    // row from before that change is somehow still sitting here, it must never
    // go out. "Hot engagement" appears in both former hot-alert templates
    // (lib/twilio.ts msg.hotAlert/hotAlertTeaser, now deleted) and nowhere
    // else — confirmed by grepping every other template. Marked handled, not
    // retried, same as the other never-deliverable cases below.
    if (n.message.includes('Hot engagement')) {
      console.warn('[twilio] flush: notification', n.id, 'is a Hot-lead alert (removed) — marked handled, not sent')
      await markSent(n.id)
      abandoned++
      continue
    }

    const phone = await resolveAgentPhone(admin, n.agent_id)

    // No phone on file: retrying can never succeed, so stamp it rather than
    // letting it sit in the queue forever.
    if (!phone) {
      console.warn('[twilio] flush: no phone for agent', n.agent_id, '— marking notification', n.id, 'undeliverable')
      await markSent(n.id)
      abandoned++
      continue
    }

    // Only treat it as delivered when Twilio actually returned a message SID —
    // ignoring the result is what previously let failed sends be stamped as
    // delivered and lost.
    const result = await sendSmsDetailed(phone, n.message)
    if (result.sent) {
      await markSent(n.id)
      sent++
      continue
    }

    // Deliberately not sent (opted out, unusable number, blocked by Twilio):
    // retrying can never succeed, so stamp it handled now rather than retrying
    // it for 3 days. sent_at is this table's only "done" marker — it is
    // already stamped the same way for undeliverable/abandoned rows above and
    // below. A consent-check FAILURE is transient, so it falls through to the
    // normal retry path.
    if (result.suppressed && result.reason !== 'check_failed') {
      console.warn('[twilio] flush: notification', n.id, 'suppressed (', result.reason, ') — marked handled, not sent')
      await markSent(n.id)
      suppressed++
      continue
    }

    const overdueMs = now.getTime() - new Date(n.scheduled_for).getTime()
    if (overdueMs >= ABANDON_AFTER_MS) {
      console.error(
        '[twilio] flush: giving up on notification', n.id, 'for agent', n.agent_id,
        `— still undelivered ${Math.floor(overdueMs / 86_400_000)}d after it was due`,
      )
      await markSent(n.id)
      abandoned++
    } else {
      // Left unsent on purpose: the next flush (opportunistic or cron) retries.
      console.warn('[twilio] flush: send failed for notification', n.id, '— leaving queued for retry')
      failed++
    }
  }

  return { processed: due?.length ?? 0, sent, failed, abandoned, suppressed }
}

// ── Message templates ─────────────────────────────────────────────────────────
const firstName = (n?: string | null) => (n || '').trim().split(/\s+/)[0] || ''

// Maps the buyer's contact_preference to the agent's contact instruction word.
// A single explicit preference wins; empty, unknown, or multiple → neutral "Contact".
const contactVerb = (pref?: string | null): string => {
  const parts = (pref || '').split(',').map(s => s.trim()).filter(Boolean)
  if (parts.length !== 1) return 'Contact'
  switch (parts[0]) {
    case 'Phone Call': return 'Call'
    case 'Text':       return 'Text'
    case 'Email':      return 'Email'
    default:           return 'Contact'
  }
}

export const msg = {
  showingAlert: (buyer: string, address: string, leadId: string, buyerPhone?: string | null, buyerEmail?: string | null, contactPreference?: string | null) => {
    const contact = buyerPhone && buyerPhone.trim()
      ? buyerPhone.trim()
      : `email only: ${(buyerEmail || '').trim() || 'n/a'}`
    return `🏠 New showing request: ${buyer} wants to see ${address}. ${contactVerb(contactPreference)}: ${contact}. View lead: ${leadUrl(leadId)}. Reply STOP to opt out.`
  },
  questionAlert: (buyer: string, address: string, leadId: string) =>
    `💬 New question from ${buyer} re: ${address}. View lead: ${leadUrl(leadId)}. Reply STOP to opt out.`,
  // hotAlert removed (final decision) — the Hot-lead SMS alert is gone.
  // Agents are texted only for showing requests and questions, above.
  // ── Expired-trial teasers ──────────────────────────────────────────────────
  // Sent to an agent whose trial has lapsed, in place of the full-detail alerts
  // above. The lead itself is still captured and stored in full — only what we
  // push to the agent's phone is withheld, so the value is visible but the
  // contact details require a subscription.
  //
  // Deliberately carry NO buyer-identifying data: no name, no phone, no email,
  // no message text. Property address only — it is the agent's own listing, not
  // buyer PII, and without it the alert is not actionable enough to convert.
  // The link points at billing rather than the lead, since the lead view itself
  // is gated for these agents.
  showingAlertTeaser: (address: string) =>
    `🏠 New showing request on ${address}. Subscribe to view contact info and respond: ${billingUrl()}. Reply STOP to opt out.`,
  questionAlertTeaser: (address: string) =>
    `💬 New question on ${address}. Subscribe to view contact info and respond: ${billingUrl()}. Reply STOP to opt out.`,
  // hotAlertTeaser removed along with hotAlert, above.

  // Buyer-facing (not agent-facing): leads with the business name so the
  // recipient can identify who is texting them from an unknown number.
  // NEVER gated on the agent's trial/billing state — the buyer is not the one
  // who owes us money, and they opted in to hear back.
  // Buyer confirmation. The number is send-only, so the text invites no reply
  // other than STOP. Address and agent name come from the same properties
  // columns the buyer page (app/p/[propertyId]) displays.
  buyerConfirmation: (kind: 'showing' | 'question', address?: string | null, agentName?: string | null) => {
    const where = (address ?? '').trim() || 'this property'
    const who = (agentName ?? '').trim() || 'the listing agent'
    const what = kind === 'showing' ? 'Your showing request for' : 'Your question about'
    return `theqrealtor: ${what} ${where} was sent to ${who}, who will contact you soon. Reply STOP to opt out.`
  },
}
