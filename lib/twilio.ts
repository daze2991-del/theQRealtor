// ── Twilio SMS helpers ────────────────────────────────────────────────────────
// Centralizes outbound sending, agent-local quiet-hours math, quiet-hours
// queueing, and the message templates used by the lead/notification flows.
// Server-side only — uses the Twilio REST API and the Supabase admin client.

import twilio from 'twilio'
import type { createAdminSupabase } from './supabase-admin'

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

// ── Sending ───────────────────────────────────────────────────────────────────
export function smsConfigured(): boolean {
  return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER)
}

// Never throws — SMS failures must never block lead capture. Returns the message
// SID on success, or null if skipped/failed (with a server-side log).
export async function sendSms(to: string | null | undefined, body: string): Promise<string | null> {
  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  const from = process.env.TWILIO_PHONE_NUMBER
  if (!sid || !token || !from) { console.warn('[twilio] not configured — skipping send'); return null }
  if (!to || !to.trim()) { console.warn('[twilio] no destination — skipping send'); return null }
  try {
    const msg = await twilio(sid, token).messages.create({ to: to.trim(), from, body })
    console.log('[twilio] sent', msg.sid, '|', msg.status, '→', to)
    return msg.sid
  } catch (err: any) {
    console.error('[twilio] send error — code:', err?.code, '| message:', err?.message)
    return null
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
  quiet_hours_start: string
  quiet_hours_end: string
}

// Sends immediately, or queues into pending_notifications when inside quiet hours
// (held, not dropped — the cron flush sends it at quiet_hours_end).
export async function queueOrSendAgentSms(opts: {
  admin: Admin
  agent: AgentNotifyProfile
  agentPhone: string | null
  leadId: string
  message: string
  now?: Date
}): Promise<'sent' | 'queued' | 'skipped'> {
  const { admin, agent, agentPhone, leadId, message } = opts
  const now = opts.now ?? new Date()
  if (!agentPhone) return 'skipped'

  if (isQuietHours(now, agent.quiet_hours_start, agent.quiet_hours_end)) {
    const scheduledFor = nextSendTime(now, agent.quiet_hours_end)
    const { error } = await admin.from('pending_notifications').insert({
      agent_id: agent.id, lead_id: leadId, message,
      scheduled_for: scheduledFor.toISOString(),
    })
    if (error) console.error('[twilio] queue error:', error.message)
    console.log('[twilio] queued for', scheduledFor.toISOString(), '(quiet hours)')
    return 'queued'
  }

  await sendSms(agentPhone, message)
  return 'sent'
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
  hotAlert: (buyer: string, address: string, leadId: string, contactPreference?: string | null, buyerPhone?: string | null) =>
    `🔥 ${buyer} just hit Hot engagement on ${address}. Phone: ${(buyerPhone || '').trim() || 'n/a'}. Preferred contact: ${contactVerb(contactPreference)}. View lead: ${leadUrl(leadId)}. Reply STOP to opt out.`,
  buyerConfirmation: (buyerName: string, address: string, agentName?: string | null) => {
    const who = firstName(agentName) || 'The agent'
    return `Hi ${firstName(buyerName) || 'there'}, thanks for your interest in ${address}. ${who} will reach out shortly. Reply STOP to opt out.`
  },
}
