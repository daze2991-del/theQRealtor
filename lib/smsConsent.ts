// Canonical text of the buyer-facing SMS consent checkbox.
//
// This exact string is rendered next to the checkbox on the lead form and is
// also what the client echoes back on submit, so the wording a buyer actually
// agreed to is stored verbatim on the lead row (leads.sms_consent_text) rather
// than being reconstructed later from whatever the code says today.
//
// If this wording ever changes, existing lead rows keep the text that was shown
// to them — that's the point. Do not "clean up" historical rows to match.
export const SMS_CONSENT_TEXT =
  'I agree to receive a one-time text message confirming this request from theqrealtor. Message and data rates may apply. Reply STOP to opt out.'

// Defensive cap for the client-echoed copy stored on the lead row.
export const SMS_CONSENT_TEXT_MAX = 500
