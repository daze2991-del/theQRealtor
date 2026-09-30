// ── Inbound SMS webhook — SEND-ONLY number ────────────────────────────────────
//
// theQRealtor's Twilio number only SENDS (agent lead alerts, buyer
// confirmations). Inbound texts are NEVER forwarded to anyone. An inbound text
// is either:
//   • a consent event — opt-out / opt-in / help — recorded in
//     sms_consent_events, with the number's current state in sms_contacts; or
//   • an ordinary message — answered with at most one short "this number
//     can't receive replies" auto-reply per number per 24h. Its body is never
//     stored or logged.
//
// ▸ Configure in the Twilio console:
//     Phone Numbers → Manage → Active numbers → (your number)
//       → Messaging → "A message comes in":  Webhook  (HTTP POST)
//       → URL:  https://theqrealtor.com/api/sms/inbound
//   The number sits in a Messaging Service whose Integration is "Defer to
//   sender's webhook", so this URL receives every inbound text.
//
// Twilio Advanced Opt-Out is enabled on that Messaging Service: for the
// keywords in lib/sms/classifyInbound.ts Twilio itself blocks/unblocks the
// number and sends the confirmation reply, so for those this route records
// the event and returns empty TwiML. Freeform revocations ("please stop
// texting me") are NOT seen by Twilio as opt-outs, so this route records them
// and sends the unsubscribe confirmation itself.

import { validateRequest } from 'twilio'
import { createAdminSupabase } from '../../../../lib/supabase-admin'
import { normalizePhone } from '../../../../lib/phone'
import { classifyInbound, type InboundClassification } from '../../../../lib/sms/classifyInbound'

type Admin = ReturnType<typeof createAdminSupabase>

const REPLY_FREEFORM_OPT_OUT =
  "theQRealtor: You're unsubscribed and won't get more texts from this number. Reply START to resubscribe."
const REPLY_AGENT =
  'theQRealtor: This number sends alerts only and replies aren\'t read. Manage your alert settings in your theQRealtor dashboard.'
const REPLY_OTHER =
  "theQRealtor: This number sends alerts only and can't receive replies. If you submitted a request, the listing agent will contact you directly."

const AUTOREPLY_WINDOW_MS = 24 * 60 * 60 * 1000
const E164 = /^\+[1-9][0-9]{7,14}$/
const MESSAGE_BODY_MAX = 500

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

// ── TwiML ─────────────────────────────────────────────────────────────────────
function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function twiml(message?: string): Response {
  const inner = message ? `<Message>${escapeXml(message)}</Message>` : ''
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`, {
    status: 200,
    headers: { 'Content-Type': 'text/xml' },
  })
}

function consentWriteFailed(reason: string): Response {
  console.error('[sms/inbound] SMS_CONSENT_WRITE_FAILED |', reason)
  return new Response('SMS_CONSENT_WRITE_FAILED', { status: 500 })
}

// ── Logging helpers — never log a message body or a full phone number ─────────
function mask(phone: string): string {
  return '***-***-' + (phone.replace(/\D/g, '').slice(-4) || '****')
}

function logOutcome(fields: {
  from: string
  to: string
  event: InboundClassification['eventType']
  source: InboundClassification['detectionSource']
  autoreply: boolean
  note?: string
}) {
  console.log(
    `[sms/inbound] event=${fields.event ?? 'none'} source=${fields.source ?? 'none'}` +
    ` from=${mask(fields.from)} to=${mask(fields.to)} autoreply=${fields.autoreply}` +
    (fields.note ? ` note=${fields.note}` : ''),
  )
}

// ── Sender linkage (for the audit trail only — never used to forward) ─────────
interface SenderLink {
  isAgent: boolean
  agentId: string | null
  leadId: string | null
}

async function identifySender(admin: Admin, fromE164: string): Promise<SenderLink> {
  const none: SenderLink = { isAgent: false, agentId: null, leadId: null }

  const { data: agents, error: agentErr } = await admin
    .from('profiles')
    .select('id')
    .eq('phone', fromE164)
    .limit(1)
  if (agentErr) {
    console.warn('[sms/inbound] agent lookup failed:', agentErr.message)
  } else if (agents && agents.length > 0) {
    return { isAgent: true, agentId: agents[0].id as string, leadId: null }
  }

  const { data: leads, error: leadErr } = await admin
    .from('leads')
    .select('id, agent_id, created_at, properties(user_id)')
    .eq('phone_e164', fromE164)
    .order('created_at', { ascending: false })
    .limit(100)
  if (leadErr) {
    console.warn('[sms/inbound] lead lookup failed:', leadErr.message)
    return none
  }
  if (!leads || leads.length === 0) return none

  // Link only when EVERY matching lead resolves to the same single agent.
  // A buyer who is a lead with two agents (or a lead whose owner can't be
  // resolved) is ambiguous: leave both NULL rather than guess.
  // PostgREST embeds a many-to-one relation as a single object; the untyped
  // client declares it as an array. Accept either.
  type Owner = { user_id: string | null }
  const owners = new Set<string | null>(
    (leads as unknown as Array<{ agent_id: string | null; properties: Owner | Owner[] | null }>)
      .map(l => {
        const prop = Array.isArray(l.properties) ? l.properties[0] : l.properties
        return l.agent_id ?? prop?.user_id ?? null
      }),
  )
  if (owners.size !== 1 || owners.has(null)) return none
  const [agentId] = [...owners] as string[]
  return { isAgent: false, agentId, leadId: leads[0].id as string }
}

export async function POST(request: Request) {
  // ── Twilio signature verification — MUST pass before anything else ──────────
  // Nothing below this gate touches the database, replies, or logs message
  // content. The body is parsed first only because the signature is computed
  // OVER those params; it is not otherwise used until validation succeeds.
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
  // full set is collected here — not just the fields used below.
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
  const from       = String(params.From ?? '').trim()
  const ourNumber  = String(params.To ?? '').trim()
  const body       = String(params.Body ?? '')
  const messageSid = String(params.MessageSid ?? params.SmsMessageSid ?? '').trim()
  const optOutType = params.OptOutType ? String(params.OptOutType) : undefined

  const fromE164 = normalizePhone(from) ?? (E164.test(from) ? from : null)
  const cls = classifyInbound({ body, optOutType })

  if (!fromE164) {
    // Can't be keyed (sms_contacts / sms_consent_events require E.164).
    if (cls.eventType) return consentWriteFailed(`sender ${mask(from)} is not E.164; ${cls.eventType} not recorded`)
    logOutcome({ from, to: ourNumber, event: null, source: null, autoreply: false, note: 'sender_not_e164' })
    return twiml()
  }

  const admin = createAdminSupabase()
  const sender = await identifySender(admin, fromE164)

  // ── Consent event: opt-out / opt-in / help ─────────────────────────────────
  if (cls.eventType) {
    if (!messageSid) return consentWriteFailed(`missing MessageSid for ${cls.eventType} from ${mask(fromE164)}`)

    // 1. Duplicate delivery? Already recorded → acknowledge and stop.
    const { data: seen, error: seenErr } = await admin
      .from('sms_consent_events')
      .select('id')
      .eq('twilio_message_sid', messageSid)
      .maybeSingle()
    if (seenErr) return consentWriteFailed(`duplicate check failed: ${seenErr.message}`)
    if (seen) {
      logOutcome({ from: fromE164, to: ourNumber, event: cls.eventType, source: cls.detectionSource, autoreply: false, note: 'duplicate_sid' })
      return twiml()
    }

    // 2. Current state FIRST — this is the write that actually stops texts.
    //    Twilio does not retry a failed messaging webhook by default, so if the
    //    audit insert below went first and this then failed, the number would be
    //    logged as opted out but never suppressed. This order errs toward
    //    blocking. Help never changes state.
    const now = new Date().toISOString()
    if (cls.eventType === 'opt_out' || cls.eventType === 'opt_in') {
      const optingOut = cls.eventType === 'opt_out'
      const { error: contactErr } = await admin
        .from('sms_contacts')
        .upsert(
          {
            phone_e164: fromE164,
            status: optingOut ? 'opted_out' : 'opted_in',
            ...(optingOut ? { opted_out_at: now } : { opted_in_at: now }),
            last_event_type: cls.eventType,
            last_keyword: cls.matchedKeyword,
            last_our_number: ourNumber || null,
          },
          { onConflict: 'phone_e164' },
        )
      if (contactErr) return consentWriteFailed(`sms_contacts upsert (${cls.eventType}, ${mask(fromE164)}): ${contactErr.message}`)
    }

    // 3. Append-only audit record.
    const { error: eventErr } = await admin.from('sms_consent_events').insert({
      phone_e164: fromE164,
      event_type: cls.eventType,
      detection_source: cls.detectionSource,
      matched_keyword: cls.matchedKeyword,
      message_body: body.slice(0, MESSAGE_BODY_MAX),
      our_number: ourNumber,
      twilio_message_sid: messageSid,
      lead_id: sender.leadId,
      agent_id: sender.agentId,
    })
    if (eventErr) {
      if ((eventErr as { code?: string }).code === '23505') {
        // A concurrent delivery of the same message recorded it first.
        logOutcome({ from: fromE164, to: ourNumber, event: cls.eventType, source: cls.detectionSource, autoreply: false, note: 'duplicate_sid' })
        return twiml()
      }
      return consentWriteFailed(`sms_consent_events insert (${cls.eventType}, ${mask(fromE164)}): ${eventErr.message}`)
    }

    // 4. Reply. Twilio already answered keyword / OptOutType messages; only a
    //    freeform revocation needs our own confirmation.
    const reply = cls.detectionSource === 'freeform_match' ? REPLY_FREEFORM_OPT_OUT : undefined
    logOutcome({ from: fromE164, to: ourNumber, event: cls.eventType, source: cls.detectionSource, autoreply: !!reply })
    return twiml(reply)
  }

  // ── Ordinary message: at most one auto-reply per number per 24h ────────────
  // Every failure here fails SAFE — no reply rather than a possible unwanted one.
  const { data: contact, error: contactErr } = await admin
    .from('sms_contacts')
    .select('status')
    .eq('phone_e164', fromE164)
    .maybeSingle()
  if (contactErr) {
    console.warn('[sms/inbound] consent lookup failed — no auto-reply:', contactErr.message)
    logOutcome({ from: fromE164, to: ourNumber, event: null, source: null, autoreply: false, note: 'consent_lookup_failed' })
    return twiml()
  }
  if (contact?.status === 'opted_out') {
    logOutcome({ from: fromE164, to: ourNumber, event: null, source: null, autoreply: false, note: 'opted_out' })
    return twiml()
  }

  const { data: throttle, error: throttleErr } = await admin
    .from('sms_autoreply_state')
    .select('last_autoreply_at')
    .eq('phone_e164', fromE164)
    .maybeSingle()
  if (throttleErr) {
    console.warn('[sms/inbound] throttle lookup failed — no auto-reply:', throttleErr.message)
    logOutcome({ from: fromE164, to: ourNumber, event: null, source: null, autoreply: false, note: 'throttle_lookup_failed' })
    return twiml()
  }
  const last = throttle?.last_autoreply_at ? Date.parse(throttle.last_autoreply_at as string) : NaN
  if (Number.isFinite(last) && Date.now() - last < AUTOREPLY_WINDOW_MS) {
    logOutcome({ from: fromE164, to: ourNumber, event: null, source: null, autoreply: false, note: 'throttled' })
    return twiml()
  }

  // Stamp BEFORE replying: if this write fails we don't reply, so a broken
  // throttle can never turn into a reply on every message.
  const { error: stampErr } = await admin
    .from('sms_autoreply_state')
    .upsert({ phone_e164: fromE164, last_autoreply_at: new Date().toISOString() }, { onConflict: 'phone_e164' })
  if (stampErr) {
    console.warn('[sms/inbound] throttle write failed — no auto-reply:', stampErr.message)
    logOutcome({ from: fromE164, to: ourNumber, event: null, source: null, autoreply: false, note: 'throttle_write_failed' })
    return twiml()
  }

  logOutcome({ from: fromE164, to: ourNumber, event: null, source: null, autoreply: true, note: sender.isAgent ? 'agent' : undefined })
  return twiml(sender.isAgent ? REPLY_AGENT : REPLY_OTHER)
}
