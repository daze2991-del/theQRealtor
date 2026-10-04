// ── "Texts off" display helpers (client-safe) ─────────────────────────────────
// Wording and pure helpers for showing SMS opt-out status in the dashboard.
// The status itself is looked up server-side (app/api/sms/opt-out-status) and
// only ever arrives here as a list of the signed-in agent's own lead ids.
//
// "Texts off" is display only. It is separate from lead status, tier, scoring,
// follow-up logic and leads.do_not_contact (an unrelated "don't call" flag).
// Suppression itself is enforced in lib/twilio.ts sendSmsDetailed().

export const TEXTS_OFF_LABEL = 'Texts off'

export const TEXTS_OFF_TOOLTIP =
  "This buyer replied STOP. theQRealtor won't text them. You can still call or email."

export const ALERTS_PAUSED_BANNER =
  'Your text alerts are paused because this number replied STOP to theQRealtor. Text START to (620) 522-8398 to turn them back on.'

/** Leads whose buyer has opted out of texts, when the filter is on; otherwise unchanged. */
export function filterTextsOffLeads<T extends { id: string }>(
  leads: T[],
  textsOffLeadIds: ReadonlySet<string>,
  on: boolean,
): T[] {
  return on ? leads.filter(l => textsOffLeadIds.has(l.id)) : leads
}
