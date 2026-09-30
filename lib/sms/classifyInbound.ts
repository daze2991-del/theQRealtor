// ── Inbound SMS consent classifier ────────────────────────────────────────────
// Pure function: decides whether an inbound text is an opt-out, opt-in or help
// request. No I/O — app/api/sms/inbound/route.ts does the recording.
//
// The keyword lists MIRROR the Twilio Advanced Opt-Out configuration on the
// "Sole Proprietor A2P Messaging Service" exactly. If those lists change in
// the Twilio Console, change them here in the same breath — a keyword Twilio
// honours but this file doesn't would block the number at Twilio without the
// app ever recording it.
//
// "yes" is deliberately NOT an opt-in keyword (removed in the Console).
//
// Order of precedence:
//   1. Twilio's own OptOutType param (STOP / START / HELP), when present.
//   2. Whole-message keyword match (the entire text IS the keyword).
//   3. Freeform opt-out phrases anywhere in the text — opt-out ONLY. Help and
//      opt-in are exact-keyword only, so "Can you help me?" is an ordinary
//      message, not a help request.
//   4. Otherwise null (an ordinary message).
//
// Failure direction: when in doubt, treat revocation language as an opt-out.
// Wrongly suppressing texts to someone is recoverable (they text START);
// texting someone who asked us to stop is not.

export type ConsentEventType = 'opt_out' | 'opt_in' | 'help'
export type DetectionSource = 'twilio_opt_out_type' | 'keyword_match' | 'freeform_match'

export interface InboundClassification {
  eventType: ConsentEventType | null
  detectionSource: DetectionSource | null
  matchedKeyword: string | null
}

export const OPT_OUT_KEYWORDS = ['cancel', 'end', 'optout', 'quit', 'revoke', 'stop', 'stopall', 'unsubscribe'] as const
export const OPT_IN_KEYWORDS  = ['start', 'unstop'] as const
export const HELP_KEYWORDS    = ['help', 'info'] as const

// Freeform revocation phrases. Matching rules (see normalizeForPhrases):
//   • case-insensitive; curly apostrophes and hyphens are normalized first,
//     so "Don’t text" and "opt-out" match "don't text" and "opt out";
//   • a phrase must START at a word boundary but may run on into a longer
//     word — "stop text" also catches "stop texting" and "stop texts",
//     "no more message" also catches "no more messages".
// Known, accepted over-matches (safe direction): "don't stop texting me"
// matches "stop text"; "opt out" matches "opt outside".
export const FREEFORM_OPT_OUT_PHRASES = [
  'stop text',
  'stop messag',
  'stop send',
  'stop contact',
  'stop call',
  'stop it',
  'stop now',
  'stop please',
  'please stop',
  'unsubscrib',
  'remove me',
  'take me off',
  'opt me out',
  'opt out',
  'optout',
  "don't text",
  'dont text',
  'do not text',
  "don't message",
  'dont message',
  'do not message',
  "don't contact",
  'dont contact',
  'do not contact',
  'no more text',
  'no more message',
  'leave me alone',
  'wrong number',
] as const

const EMPTY: InboundClassification = { eventType: null, detectionSource: null, matchedKeyword: null }

const KEYWORD_EVENT = new Map<string, ConsentEventType>([
  ...OPT_OUT_KEYWORDS.map(k => [k, 'opt_out'] as const),
  ...OPT_IN_KEYWORDS.map(k => [k, 'opt_in'] as const),
  ...HELP_KEYWORDS.map(k => [k, 'help'] as const),
])

const OPT_OUT_TYPE_EVENT: Record<string, ConsentEventType> = {
  stop: 'opt_out',
  start: 'opt_in',
  help: 'help',
}

/** Whole-message form: trimmed, lowercased, with any leading/trailing
 *  punctuation, whitespace, symbols or emoji removed ("  Stop!! 🛑 " → "stop").
 *  Interior characters are untouched, so "stop texting" stays two words. */
export function normalizeForKeyword(body: string): string {
  return body
    .toLowerCase()
    .replace(/^[^\p{L}\p{N}]+/u, '')
    .replace(/[^\p{L}\p{N}]+$/u, '')
}

/** Phrase-search form: lowercased, curly apostrophes → ', every other
 *  non-letter/digit/apostrophe → a single space, padded with spaces so a
 *  phrase can be matched on a leading word boundary. */
export function normalizeForPhrases(body: string): string {
  const flat = body
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[^\p{L}\p{N}']+/gu, ' ')
    .trim()
  return ` ${flat} `
}

export function classifyInbound(input: { body: string; optOutType?: string | null }): InboundClassification {
  const body = input.body ?? ''

  // 1. Twilio already classified it.
  const oot = (input.optOutType ?? '').trim().toLowerCase()
  const ootEvent = OPT_OUT_TYPE_EVENT[oot]
  if (ootEvent) {
    const kw = normalizeForKeyword(body)
    return {
      eventType: ootEvent,
      detectionSource: 'twilio_opt_out_type',
      // Record the keyword they actually sent when it is one; else Twilio's type.
      matchedKeyword: KEYWORD_EVENT.has(kw) ? kw : oot,
    }
  }

  // 2. The entire message is a keyword.
  const kw = normalizeForKeyword(body)
  const kwEvent = KEYWORD_EVENT.get(kw)
  if (kwEvent) {
    return { eventType: kwEvent, detectionSource: 'keyword_match', matchedKeyword: kw }
  }

  // 3. Revocation language anywhere in the message (opt-out only).
  const text = normalizeForPhrases(body)
  const phrase = FREEFORM_OPT_OUT_PHRASES.find(p => text.includes(` ${p}`))
  if (phrase) {
    return { eventType: 'opt_out', detectionSource: 'freeform_match', matchedKeyword: phrase }
  }

  // 4. Ordinary message.
  return EMPTY
}
