import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizePhone } from '../phone'
import { resolveAgentPhone } from '../twilio'

// ── SMS opt-out status for one agent's dashboard (server-only) ────────────────
// public.sms_contacts is service-role only (RLS on, no policies), so the
// browser can never read it. This reads it on the agent's behalf and returns
// ONLY:
//   • the ids of the agent's own leads whose phone is opted out, and
//   • whether the agent's own alert number is opted out.
// No phone numbers and no sms_contacts rows leave the server, and it takes no
// caller-supplied number, so it can't be used to probe arbitrary numbers.

export interface AgentOptOutStatus {
  textsOffLeadIds: string[]
  ownAlertsPaused: boolean
}

const E164 = /^\+[1-9][0-9]{7,14}$/
const IN_CHUNK = 200

/** Same rule sendSmsDetailed() uses to key a number before checking sms_contacts. */
export function normalizeForOptOut(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return null
  return normalizePhone(trimmed) ?? (E164.test(trimmed) ? trimmed : null)
}

async function optedOut(admin: SupabaseClient, numbers: string[]): Promise<Set<string>> {
  const out = new Set<string>()
  for (let i = 0; i < numbers.length; i += IN_CHUNK) {
    const { data, error } = await admin
      .from('sms_contacts')
      .select('phone_e164')
      .in('phone_e164', numbers.slice(i, i + IN_CHUNK))
      .eq('status', 'opted_out')
    if (error) throw new Error(`sms_contacts lookup failed: ${error.message}`)
    for (const r of data ?? []) out.add(r.phone_e164 as string)
  }
  return out
}

/**
 * @param rls   the signed-in agent's own (RLS-bound) client — leads are read
 *              through it AND filtered to agent_id, so only their leads count
 * @param admin service-role client, used only for sms_contacts and to resolve
 *              the agent's alert number exactly as alerts do
 */
export async function getAgentOptOutStatus(opts: {
  rls: SupabaseClient
  admin: SupabaseClient
  agentId: string
}): Promise<AgentOptOutStatus> {
  const { rls, admin, agentId } = opts

  const { data: leads, error: leadsErr } = await rls
    .from('leads')
    .select('id, phone_e164')
    .eq('agent_id', agentId)
    .not('phone_e164', 'is', null)
  if (leadsErr) throw new Error(`leads lookup failed: ${leadsErr.message}`)

  // The agent's alert number, resolved the same way alerts resolve it
  // (profiles.phone, then properties.agent_phone), then keyed the same way.
  const ownNumber = normalizeForOptOut(await resolveAgentPhone(admin, agentId))

  const leadRows = (leads ?? []) as { id: string; phone_e164: string | null }[]
  const numbers = new Set<string>()
  for (const l of leadRows) if (l.phone_e164) numbers.add(l.phone_e164)
  if (ownNumber) numbers.add(ownNumber)

  const blocked = numbers.size ? await optedOut(admin, [...numbers]) : new Set<string>()

  return {
    textsOffLeadIds: leadRows.filter(l => l.phone_e164 && blocked.has(l.phone_e164)).map(l => l.id),
    ownAlertsPaused: !!ownNumber && blocked.has(ownNumber),
  }
}
