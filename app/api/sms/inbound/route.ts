// ── Inbound SMS webhook ───────────────────────────────────────────────────────
//
// Twilio calls this when someone texts your Twilio number. It forwards the reply
// to the agent's real phone and returns empty TwiML (no auto-reply), which kills
// Twilio's default "configure your SMS URL" response.
//
// ▸ Configure in the Twilio console:
//     Phone Numbers → Manage → Active numbers → (your number)
//       → Messaging → "A message comes in":  Webhook  (HTTP POST)
//       → URL:  https://theqrealtor.com/api/sms/inbound
//
// Single-agent model: replies are forwarded to the agent that owns the matched
// lead, or (no match) to INBOUND_FORWARD_PHONE if set, else the first agent whose
// profile has a phone. Twilio handles STOP/HELP at the carrier level, so we don't.

import { validateRequest } from 'twilio'
import { createAdminSupabase } from '../../../../lib/supabase-admin'
import { sendSms, resolveAgentPhone } from '../../../../lib/twilio'

type Admin = ReturnType<typeof createAdminSupabase>

const digits10 = (s: string) => (s || '').replace(/\D/g, '').slice(-10)

// ── Webhook URL reconstruction ────────────────────────────────────────────────
// Twilio signs the EXACT URL configured in its console, so what we rebuild here
// must match that string byte for byte or every legitimate request fails.
//
// Derived from the inbound request rather than a hardcoded constant: on Vercel
// the Host header is the public host the request actually arrived on (the
// custom domain, theqrealtor.com), which is precisely what Twilio dialed. A
// pinned NEXT_PUBLIC_APP_URL would silently break validation the moment the
// console URL and that env var disagree (e.g. apex vs *.vercel.app).
//
// TWILIO_WEBHOOK_URL is an operator escape hatch: set it to the console URL
// verbatim to override this derivation without shipping a code change.
//
// Deriving the host from a client-controllable header is NOT a bypass: the
// attacker still cannot produce a valid HMAC for any URL without the auth
// token, so a forged Host only ever causes a mismatch — never a false pass.
function webhookUrl(request: Request): string {
  const override = process.env.TWILIO_WEBHOOK_URL?.trim()
  if (override) return override

  const { pathname, search } = new URL(request.url)
  // Proxy headers may be comma-joined lists; the first entry is the original.
  const proto = request.headers.get('x-forwarded-proto')?.split(',')[0].trim() || 'https'
  const host =
    request.headers.get('x-forwarded-host')?.split(',')[0].trim() ||
    request.headers.get('host')?.trim() ||
    ''

  return `${proto}://${host}${pathname}${search}`
}

// Empty TwiML — acknowledges receipt with no auto-reply.
function emptyTwiml() {
  return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
    status: 200,
    headers: { 'Content-Type': 'text/xml' },
  })
}

// Match a lead by the sender's number. Tries an exact match first, then compares
// the last 10 digits across recent leads (buyer-entered formats vary).
async function findLeadByPhone(admin: Admin, from: string) {
  const { data: exact } = await admin
    .from('leads')
    .select('id, name, phone, property_id, agent_id')
    .eq('phone', from)
    .order('created_at', { ascending: false })
    .limit(1)
  if (exact && exact.length > 0) return exact[0]

  const tail = digits10(from)
  if (tail.length < 10) return null
  const { data: recent } = await admin
    .from('leads')
    .select('id, name, phone, property_id, agent_id')
    .not('phone', 'is', null)
    .order('created_at', { ascending: false })
    .limit(500)
  return (recent || []).find((l: any) => digits10(l.phone) === tail) ?? null
}

async function firstAgentPhone(admin: Admin): Promise<string | null> {
  const { data: profs } = await admin
    .from('profiles').select('phone').not('phone', 'is', null).limit(1)
  if (profs?.[0]?.phone && String(profs[0].phone).trim()) return String(profs[0].phone).trim()
  const { data: props } = await admin
    .from('properties').select('agent_phone').not('agent_phone', 'is', null).limit(1)
  const p = props?.[0]?.agent_phone
  return p && String(p).trim() ? String(p).trim() : null
}

export async function POST(request: Request) {
  // ── Twilio signature verification — MUST pass before anything else ──────────
  // Nothing below this gate touches the database, forwards a message, or logs
  // message content. The body is parsed first only because the signature is
  // computed OVER those params; it is not otherwise used until validation
  // succeeds.
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const signature = request.headers.get('x-twilio-signature') ?? ''

  if (!authToken) {
    // Fail closed: without the token no request can be proven to be Twilio's.
    console.error('[sms/inbound] TWILIO_AUTH_TOKEN not set — rejecting (cannot verify signature)')
    return new Response('Forbidden', { status: 403 })
  }
  if (!signature) {
    console.warn('[sms/inbound] rejected: missing X-Twilio-Signature header')
    return new Response('Forbidden', { status: 403 })
  }

  // Twilio posts application/x-www-form-urlencoded. EVERY posted field feeds the
  // signature (it is an HMAC over the URL plus all params sorted by key), so the
  // full set is collected here — not just the three fields used below.
  let params: Record<string, string>
  try {
    const form = await request.formData()
    params = {}
    form.forEach((value, key) => { params[key] = typeof value === 'string' ? value : '' })
  } catch {
    console.warn('[sms/inbound] rejected: unparseable form body')
    return new Response('Forbidden', { status: 403 })
  }

  const url = webhookUrl(request)
  if (!validateRequest(authToken, signature, url, params)) {
    // Deliberately does NOT log From/Body — an unverified payload is attacker
    // -controlled and must not be echoed into logs. URL only, to diagnose a
    // console/deployment URL mismatch.
    console.warn('[sms/inbound] rejected: invalid Twilio signature | validated against URL:', url)
    return new Response('Forbidden', { status: 403 })
  }

  // ── Verified Twilio request from here down ─────────────────────────────────
  const from = String(params.From ?? '')
  const body = String(params.Body ?? '')
  const to   = String(params.To ?? '')

  console.log('[sms/inbound] From:', from, '| To:', to, '| Body:', body.slice(0, 80))

  if (!from || !body) return emptyTwiml()

  const admin = createAdminSupabase()

  // Identify the lead (and thus the owning agent + property address)
  const lead = await findLeadByPhone(admin, from)
  let address: string | null = null
  let agentId: string | null = lead?.agent_id ?? null

  if (lead) {
    const { data: prop } = await admin
      .from('properties').select('address, user_id').eq('id', lead.property_id).single()
    address = prop?.address ?? null
    if (!agentId) agentId = prop?.user_id ?? null
  }

  // Resolve where to forward: matched agent → env override → first configured agent
  let agentPhone = await resolveAgentPhone(admin, agentId)
  if (!agentPhone) agentPhone = process.env.INBOUND_FORWARD_PHONE?.trim() || (await firstAgentPhone(admin))

  if (agentPhone) {
    const forward = lead
      ? `Reply from ${lead.name || 'Unknown buyer'}${address ? ` re: ${address}` : ''}: "${body}"`
      : `SMS reply from ${from}: "${body}"`
    await sendSms(agentPhone, forward)
  } else {
    console.warn('[sms/inbound] no agent phone to forward to — dropping')
  }

  return emptyTwiml()
}
