// Customer-facing wording for the invite-only signup state. Plain module (no
// 'server-only') so the auth page, the API route and the tests share one string.
// OPEN_SIGNUP_ENABLED stays the only thing that opens signup — see lib/signup.ts.

export const INVITE_EMAIL = 'hello@theqrealtor.com'

/** Shown to anyone refused by the allowlist / agent-cap gate on signup. */
export const INVITE_ONLY_MESSAGE =
  `theQRealtor is invite-only right now. Email ${INVITE_EMAIL} to request an invite.`

/** Label for every "get access" button on the marketing page (points at the signup tab). */
export const REQUEST_INVITE_LABEL = 'Request an invite'

/** Every "Request an invite" button on the marketing page opens this email. */
export const INVITE_MAILTO = `mailto:${INVITE_EMAIL}?subject=theQRealtor%20invite%20request`
