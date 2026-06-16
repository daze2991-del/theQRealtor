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

import { createAdminSupabase } from '../../../../lib/supabase-admin'
import { sendSms, resolveAgentPhone } from '../../../../lib/twilio'

type Admin = ReturnType<typeof createAdminSupabase>

const digits10 = (s: string) => (s || '').replace(/\D/g, '').slice(-10)

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
  // Twilio posts application/x-www-form-urlencoded
  let from = '', body = '', to = ''
  try {
    const form = await request.formData()
    from = String(form.get('From') ?? '')
    body = String(form.get('Body') ?? '')
    to   = String(form.get('To') ?? '')
  } catch {
    return emptyTwiml()
  }

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
