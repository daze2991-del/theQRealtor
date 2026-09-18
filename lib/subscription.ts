import type Stripe from 'stripe'

// ── Stripe Subscription → profiles columns ───────────────────────────────────
//
// One place that knows where Stripe actually keeps each field on the pinned
// API version (2026-04-22.dahlia, see lib/stripe.ts). Two of these locations
// are NOT where you would guess, and both were confirmed against live test-mode
// payloads on 2026-09-16 rather than assumed:
//
//   • current_period_end lives on the LINE ITEM (items.data[0]), not on the
//     Subscription root. `sub.current_period_end` is not merely undefined at
//     runtime — the field does not exist in the SDK's Subscription interface
//     at all, so reading it is a compile error rather than a silent null.
//     That is the only reason this mistake is catchable here.
//
//   • cancel_at_period_end can be FALSE while a cancellation is genuinely
//     scheduled. See cancellationScheduled() below.
//
// Keeping the mapping pure (Stripe object in, plain column patch out) means it
// can be exercised without a database or a network call, and a future
// reconciliation job can reuse it verbatim.

/** The exact shape written to public.profiles by the subscription handlers. */
export interface SubscriptionPatch {
  subscription_status: string
  current_period_end: string | null
  cancel_at_period_end: boolean
  cancel_at: string | null
  cancellation_reason: string | null
  price_id: string | null
}

/** Unix seconds → ISO 8601, for timestamptz columns. Null-safe. */
function toIso(unixSeconds: number | null | undefined): string | null {
  if (typeof unixSeconds !== 'number') return null
  return new Date(unixSeconds * 1000).toISOString()
}

/**
 * Map a Stripe Subscription onto the profile columns it owns.
 *
 * Deliberately does NOT return `plan`. Translating a Stripe price back into a
 * product tier and writing it is an entitlement change, and that decision is
 * still parked pending the ARL review — see the deferred note in the webhook
 * and lib/billing.ts. This function records what Stripe says; it never decides
 * what the agent is entitled to.
 */
export function subscriptionPatch(sub: Stripe.Subscription): SubscriptionPatch {
  // A subscription always has at least one item in practice, but an empty
  // items array is representable, so this stays defensive rather than
  // asserting items.data[0] exists.
  const item = sub.items?.data?.[0]

  return {
    subscription_status: sub.status,
    current_period_end: toIso(item?.current_period_end),
    // Stored raw. This column keeps meaning exactly what Stripe means by it —
    // correcting it here would make the stored value disagree with the Stripe
    // dashboard, which is worse than a field that needs a helper to read.
    cancel_at_period_end: sub.cancel_at_period_end,
    cancel_at: toIso(sub.cancel_at),
    cancellation_reason: sub.cancellation_details?.reason ?? null,
    price_id: item?.price?.id ?? null,
  }
}

/**
 * Is a cancellation scheduled for this subscription?
 *
 * THE TRAP, verified live on 2026-09-16: cancelling through the Stripe billing
 * portal produced customer.subscription.updated with status='active',
 * cancel_at set to a real timestamp, and cancel_at_period_end === FALSE.
 * Reading the boolean alone reports "not cancelling" for a cancellation the
 * customer has already confirmed.
 *
 * Accepts the stored row shape (not a Stripe object) so the app can answer this
 * from the database without a Stripe round-trip — which is the entire point of
 * persisting these columns.
 */
export function cancellationScheduled(profile: {
  cancel_at?: string | null
  cancel_at_period_end?: boolean | null
}): boolean {
  return profile.cancel_at != null || profile.cancel_at_period_end === true
}
