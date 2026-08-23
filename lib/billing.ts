import 'server-only'

// ── Billing automation kill switch ───────────────────────────────────────────
//
// THE RULE: while this returns false, no Stripe-originated code path may write
// an entitlement change (profiles.plan, account_status, billing_interval,
// subscription fields) or create/modify a subscription. Production billing is
// MANUAL — the founder sets plan/account_status by hand in Supabase.
//
// Fails CLOSED. Anything other than the exact string 'true' — unset, empty,
// 'True', '1', 'yes' — leaves automation disabled. This is deliberate: a typo
// in an env var must never be the thing that switches real billing on.
//
// This is a SERVER-ONLY module ('server-only' above makes a client import a
// hard build error), so the switch can never be evaluated or bypassed in the
// browser.
//
// Deliberately INDEPENDENT of the two pre-existing switches, which are
// untouched and both remain off:
//   • STRIPE_CHARGES_ENABLED — gates /api/stripe/checkout and /api/stripe/portal
//   • PAID_PLANS_ENABLED     — client-side display flag in the billing page
// All three must be on before any billing is live end-to-end. Turning on only
// this one still creates no charges — it only permits webhook-driven writes.
export function billingAutomationEnabled(): boolean {
  return process.env.BILLING_AUTOMATION_ENABLED === 'true'
}

/** Standard response for a code path that is disabled pending manual billing. */
export const MANUAL_BILLING_ONLY = {
  error: 'Billing automation is disabled — this account is managed manually.',
} as const
