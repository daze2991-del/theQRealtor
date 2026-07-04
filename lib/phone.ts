import { parsePhoneNumberFromString } from 'libphonenumber-js'

/**
 * Normalize a raw phone input to E.164 (e.g. "+15555555555").
 * Country defaults to US for inputs without an explicit +country prefix.
 * Returns null if the input is invalid or unparseable — callers must treat
 * null as a validation failure, never store the raw input.
 */
export function normalizePhone(rawInput: string): string | null {
  const parsed = parsePhoneNumberFromString(rawInput, 'US')
  if (!parsed || !parsed.isValid()) return null
  return parsed.number
}
