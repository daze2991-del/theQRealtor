import 'server-only'
import type Stripe from 'stripe'
import type { createAdminSupabase } from './supabase-admin'
import { planForPriceId } from './pricing'

// ── Stripe → profiles sync ───────────────────────────────────────────────────
//
// The ONLY code that writes Stripe-derived entitlements to profiles. Callers
// (the webhook, the change-plan route) must already have checked
// BILLING_AUTOMATION_ENABLED — this module does not re-check it.
//
// Rules:
//   • Always work from a subscription/invoice retrieved fresh from Stripe,
//     never from an event payload — events arrive out of order and retried.
//     Every write is an absolute value, so replaying is harmless.
//   • The plan comes from the subscription's price ID via lib/pricing.ts.
//     Unknown price ID → log and change nothing.
//   • active / trialing                     → the mapped paid plan
//   • past_due (and incomplete, paused)     → plan kept; status fields stored
//   • canceled / unpaid / incomplete_expired → 'free' if they were on a paid
//     plan (starter/pro). A trial/free agent whose first payment never went
//     through keeps what they had. Moving to 'free' fires the 067 downgrade
//     trigger (auto-fit + chooser). Nothing is ever deleted.
//   • founding / alpha are never re-planned: only the Stripe ids are stored.
//
// Writes go through the service-role client; trg_protect_profile_entitlements
// lets them through because auth.role() is service_role, not
// authenticated/anon (see 067 §2 and tests/stripe-webhook-db.test.ts).

type Db = ReturnType<typeof createAdminSupabase>

export const ENTITLED_STATUSES: readonly string[] = ['active', 'trialing']
export const TERMINAL_STATUSES: readonly string[] = ['canceled', 'unpaid', 'incomplete_expired']
/** Statuses that block a new Checkout (a second subscription). */
export const REUSABLE_STATUSES: readonly string[] = ['canceled', 'incomplete_expired']
const GRANDFATHERED_PLANS: readonly string[] = ['founding', 'alpha']
const PAID_PLANS: readonly string[] = ['starter', 'pro']

export interface SyncProfile {
  id: string
  plan: string | null
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
}

export type SyncResult =
  | {
      outcome: 'updated'
      profileId: string
      planBefore: string | null
      planAfter: string | null
      /** Set for subscription writes; lets callers tell "new subscription" from "plan change". */
      subscription?: {
        idBefore: string | null
        idAfter: string
        status: string
        priceId: string | null
        currentPeriodEnd: string | null
        cancelAtPeriodEnd: boolean
      }
    }
  | { outcome: 'skipped'; reason: string }
  | { outcome: 'error'; message: string }

const PROFILE_COLS = 'id, plan, stripe_customer_id, stripe_subscription_id'

const iso = (unix: number | null | undefined) => (unix ? new Date(unix * 1000).toISOString() : null)
const idOf = (v: string | { id: string } | null | undefined) => (typeof v === 'string' ? v : v?.id ?? null)

/**
 * Pure: the profiles update for a (freshly retrieved) subscription, or null
 * with the reason nothing should be written.
 */
export function subscriptionProfileUpdate(
  sub: Stripe.Subscription,
  profile: SyncProfile,
): { update: Record<string, unknown> | null; reason?: string } {
  const customerId = idOf(sub.customer as string | { id: string })
  const idsOnly: Record<string, unknown> = { stripe_subscription_id: sub.id }
  if (!profile.stripe_customer_id && customerId) idsOnly.stripe_customer_id = customerId

  // A different subscription is already on file. Adopt this one only if it is
  // the one granting access now; a lapsed/old subscription must never
  // overwrite (or downgrade) the current one.
  if (profile.stripe_subscription_id && profile.stripe_subscription_id !== sub.id
      && !ENTITLED_STATUSES.includes(sub.status)) {
    return { update: null, reason: 'not_current_subscription' }
  }

  if (GRANDFATHERED_PLANS.includes(profile.plan ?? '')) {
    return { update: idsOnly, reason: 'grandfathered_ids_only' }
  }

  const item = sub.items?.data?.[0]
  const priceId = item?.price?.id ?? null
  const tier = planForPriceId(priceId)
  if (!tier) return { update: null, reason: 'unknown_price' }

  const update: Record<string, unknown> = {
    ...idsOnly,
    subscription_status: sub.status,
    price_id: priceId,
    current_period_end: iso(item?.current_period_end),
    cancel_at_period_end: sub.cancel_at_period_end ?? false,
    cancel_at: iso(sub.cancel_at),
    trial_end: iso(sub.trial_end),
  }

  if (ENTITLED_STATUSES.includes(sub.status)) {
    update.plan = tier
  } else if (TERMINAL_STATUSES.includes(sub.status)) {
    if (PAID_PLANS.includes(profile.plan ?? '')) update.plan = 'free'
  }
  // past_due / incomplete / paused: plan untouched (Stripe's retry window is
  // the grace period).
  return { update }
}

async function findProfile(
  db: Db,
  by: { userId?: string | null; customerId?: string | null; subscriptionId?: string | null },
): Promise<{ profile: SyncProfile | null; error?: string }> {
  const lookups: [string, string | null | undefined][] = [
    ['id', by.userId],
    ['stripe_customer_id', by.customerId],
    ['stripe_subscription_id', by.subscriptionId],
  ]
  for (const [col, val] of lookups) {
    if (!val) continue
    const { data, error } = await db.from('profiles').select(PROFILE_COLS).eq(col, val).limit(2)
    if (error) return { profile: null, error: error.message }
    if (data && data.length > 1) {
      console.error(`[stripeSync] ${data.length}+ profiles share ${col}=${val} — refusing to guess`)
      return { profile: null }
    }
    if (data && data.length === 1) return { profile: data[0] as SyncProfile }
  }
  return { profile: null }
}

/** Retrieve the subscription from Stripe and write it to the owning profile. */
export async function syncSubscription(
  db: Db,
  stripe: Stripe,
  subscriptionId: string,
  hint: { userId?: string | null; customerId?: string | null } = {},
): Promise<SyncResult> {
  const sub = await stripe.subscriptions.retrieve(subscriptionId)
  const customerId = idOf(sub.customer as string | { id: string })

  const { profile, error } = await findProfile(db, {
    userId: hint.userId || sub.metadata?.agent_id || null,
    customerId: customerId || hint.customerId,
    subscriptionId: sub.id,
  })
  if (error) return { outcome: 'error', message: `profile lookup failed: ${error}` }
  if (!profile) {
    console.warn(`[stripeSync] no profile for subscription ${sub.id} (customer ${customerId})`)
    return { outcome: 'skipped', reason: 'no_profile' }
  }

  const { update, reason } = subscriptionProfileUpdate(sub, profile)
  if (!update) {
    console.warn(`[stripeSync] ${sub.id} → profile ${profile.id}: no change (${reason}, price ${sub.items?.data?.[0]?.price?.id ?? 'none'})`)
    return { outcome: 'skipped', reason: reason ?? 'no_change' }
  }
  if (reason === 'grandfathered_ids_only') {
    console.log(`[stripeSync] profile ${profile.id} is ${profile.plan} — storing Stripe ids only, plan unchanged`)
  }

  const { error: writeError } = await db.from('profiles').update(update).eq('id', profile.id)
  if (writeError) return { outcome: 'error', message: `profile write failed: ${writeError.message}` }

  const planAfter = 'plan' in update ? (update.plan as string) : profile.plan
  console.log(`[stripeSync] ${sub.id} (${sub.status}) → profile ${profile.id}: plan ${profile.plan} → ${planAfter}`)
  return {
    outcome: 'updated', profileId: profile.id, planBefore: profile.plan, planAfter,
    subscription: {
      idBefore: profile.stripe_subscription_id,
      idAfter: sub.id,
      status: sub.status,
      priceId: (update.price_id as string | undefined) ?? null,
      currentPeriodEnd: (update.current_period_end as string | undefined) ?? null,
      cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
    },
  }
}

/**
 * invoice.payment_failed → stamp last_payment_failed_at; invoice.paid → clear
 * it. The invoice is re-read so an out-of-order "failed" for an invoice that
 * has since been paid does not stamp anything.
 */
export async function syncInvoice(
  db: Db,
  stripe: Stripe,
  invoiceId: string,
  kind: 'failed' | 'paid',
  eventCreated: number,
): Promise<SyncResult> {
  const invoice = await stripe.invoices.retrieve(invoiceId)
  const customerId = idOf(invoice.customer as string | { id: string } | null)
  const subscriptionId = idOf(
    (invoice.parent?.subscription_details?.subscription ?? null) as string | { id: string } | null,
  )

  const { profile, error } = await findProfile(db, { customerId, subscriptionId })
  if (error) return { outcome: 'error', message: `profile lookup failed: ${error}` }
  if (!profile) return { outcome: 'skipped', reason: 'no_profile' }
  if (GRANDFATHERED_PLANS.includes(profile.plan ?? '')) return { outcome: 'skipped', reason: 'grandfathered' }

  let update: Record<string, unknown>
  if (kind === 'failed') {
    if (invoice.status === 'paid') return { outcome: 'skipped', reason: 'invoice_already_paid' }
    update = { last_payment_failed_at: iso(eventCreated) }
  } else {
    if (invoice.status !== 'paid') return { outcome: 'skipped', reason: 'invoice_not_paid' }
    update = { last_payment_failed_at: null }
  }

  const { error: writeError } = await db.from('profiles').update(update).eq('id', profile.id)
  if (writeError) return { outcome: 'error', message: `profile write failed: ${writeError.message}` }
  return { outcome: 'updated', profileId: profile.id, planBefore: profile.plan, planAfter: profile.plan }
}

/**
 * The agent's existing subscription that is not canceled/incomplete_expired,
 * if any — checked against Stripe itself (the subscription on file AND every
 * subscription on the customer), not only the profile row, which can lag the
 * webhook. Throws on a Stripe error; callers must fail closed.
 */
export async function findBlockingSubscription(
  stripe: Stripe,
  customerId: string | null,
  subscriptionId: string | null,
): Promise<Stripe.Subscription | null> {
  if (subscriptionId) {
    const sub = await stripe.subscriptions.retrieve(subscriptionId)
    if (!REUSABLE_STATUSES.includes(sub.status)) return sub
  }
  if (customerId) {
    const list = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 100 })
    const open = list.data.find(s => !REUSABLE_STATUSES.includes(s.status))
    if (open) return open
  }
  return null
}

/** True when the configured secret key is a live-mode key. */
export function stripeKeyIsLive(): boolean {
  const k = process.env.STRIPE_SECRET_KEY ?? ''
  return k.startsWith('sk_live_') || k.startsWith('rk_live_')
}
