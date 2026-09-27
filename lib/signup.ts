import 'server-only'

// ── Open self-service signup kill switch ─────────────────────────────────────
//
// THE RULE: while this returns false, /api/auth/beta-signup behaves exactly as
// it does today — an email must have an approved row in beta_allowlist before
// an account can be created. Turning it on skips ONLY that allowlist gate.
// Every other guard on that route is unaffected and still runs: phone format
// validation, server-side phone-verification token, phone uniqueness, and the
// hard agent cap below.
//
// Fails CLOSED. Anything other than the exact string 'true' — unset, empty,
// 'True', '1', 'yes' — leaves signup invite-only. Same deliberate shape as
// lib/billing.ts: a typo in an env var must never be the thing that opens
// public registration.
//
// SERVER-ONLY ('server-only' above makes a client import a hard build error),
// so the switch can never be read or bypassed in the browser.
//
// Deliberately INDEPENDENT of the billing switches (BILLING_AUTOMATION_ENABLED,
// STRIPE_CHARGES_ENABLED, PAID_PLANS_ENABLED). Opening signup creates accounts;
// it does not create charges, and it must not be coupled to anything that does.
export function openSignupEnabled(): boolean {
  return process.env.OPEN_SIGNUP_ENABLED === 'true'
}

// ── Hard cap on enrolled agents ──────────────────────────────────────────────
//
// Enforced on EVERY signup path, invite-only and open alike. This is the
// backstop that keeps an accidental switch flip from enrolling unbounded
// agents, so it must never be gated behind openSignupEnabled().
//
// Counted from profiles.beta_joined_at, NOT from beta_allowlist.joined_at.
// The allowlist is not a reliable population count for two reasons:
//   1. An open signup creates no allowlist row at all, so a cap keyed on that
//      table would simply never increment — the cap would be inert exactly
//      when it matters most.
//   2. It already drifts today. A deleted test account can leave joined_at
//      stamped on a row whose profile is gone (inflating the count), while an
//      agent created outside the route has a profile but an unstamped
//      allowlist row (deflating it).
// profiles.beta_joined_at is set by this route for every agent it creates and
// disappears with the account, so it tracks the real population on both paths.
export const MAX_ENROLLED_AGENTS = 25
