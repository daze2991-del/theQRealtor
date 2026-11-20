// Reply text sent by app/api/sms/inbound/route.ts. Lives here (not in the
// route file) because Next.js route modules cannot export arbitrary values,
// and the SMS Consent page (app/sms-consent) renders REPLY_FREEFORM_OPT_OUT
// so the registered sample can never drift from what is actually sent.
export const REPLY_FREEFORM_OPT_OUT =
  "theQRealtor: You're unsubscribed and won't get more texts from this number. Reply START to resubscribe."
export const REPLY_AGENT =
  'theQRealtor: This number sends alerts only and replies aren\'t read. Manage your alert settings in your theQRealtor dashboard.'
export const REPLY_OTHER =
  "theQRealtor: This number sends alerts only and can't receive replies. If you submitted a request, the listing agent will contact you directly."
