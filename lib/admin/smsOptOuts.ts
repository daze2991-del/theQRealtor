import 'server-only'
import { createServiceSupabase } from '../supabase-service'
import { assertAdmin } from './auth'

// ── God Mode: SMS opt-out oversight (READ-ONLY) ───────────────────────────────
// Opt-out / opt-in events that couldn't be matched to exactly one agent
// (sms_consent_events.agent_id IS NULL), plus a count of numbers currently
// opted out. Re-verifies admin itself, like getBetaOverview().
//
// Phone numbers are masked to the last 4 digits HERE, on the server, before
// anything is returned — a full number never reaches the page or the browser.
// No message bodies, no keywords, no lead/agent ids.

export interface UnmatchedConsentEvent {
  id: string
  phoneLast4: string
  eventType: 'opt_out' | 'opt_in'
  receivedAt: string
}

export interface SmsOptOutOverview {
  optedOutCount: number
  unmatchedEvents: UnmatchedConsentEvent[]
}

export const UNMATCHED_EVENTS_LIMIT = 200

export function last4(phone: string | null | undefined): string {
  const digits = (phone ?? '').replace(/\D/g, '')
  return digits.length >= 4 ? digits.slice(-4) : '????'
}

export async function getSmsOptOutOverview(): Promise<SmsOptOutOverview> {
  await assertAdmin()
  const svc = createServiceSupabase()

  const [{ count, error: countErr }, { data: rows, error: rowsErr }] = await Promise.all([
    svc.from('sms_contacts').select('phone_e164', { count: 'exact', head: true }).eq('status', 'opted_out'),
    svc.from('sms_consent_events')
      .select('id, phone_e164, event_type, received_at')
      .is('agent_id', null)
      .in('event_type', ['opt_out', 'opt_in'])
      .order('received_at', { ascending: false })
      .limit(UNMATCHED_EVENTS_LIMIT),
  ])
  if (countErr) throw new Error(`sms_contacts count failed: ${countErr.message}`)
  if (rowsErr) throw new Error(`sms_consent_events read failed: ${rowsErr.message}`)

  return {
    optedOutCount: count ?? 0,
    unmatchedEvents: (rows ?? []).map((r: any) => ({
      id: r.id as string,
      phoneLast4: last4(r.phone_e164),
      eventType: r.event_type as 'opt_out' | 'opt_in',
      receivedAt: r.received_at as string,
    })),
  }
}
