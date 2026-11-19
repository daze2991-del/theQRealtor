import 'server-only'
import type { createAdminSupabase } from './supabase-admin'
import type { SyncResult } from './stripeSync'
import { sendBillingEmail, subscriptionConfirmationEmail } from './email'

// ── Subscription confirmation email ──────────────────────────────────────────
//
// Sent when a sync run actually STARTS a paid subscription or MOVES the agent
// to a different paid plan — and only then. Because it keys off "did this
// write change anything", a replayed or out-of-order event that finds the
// profile already up to date sends nothing; the Resend idempotency key covers
// the narrow races the state check can't (two syncs reading the same
// before-state, a retry after a half-finished attempt).
//
// BEST-EFFORT. Nothing in here throws or changes the plan/webhook outcome; a
// failed lookup or send is logged and dropped. Called after the profile write
// has succeeded.

type Db = ReturnType<typeof createAdminSupabase>

const PAID = ['starter', 'pro']
const ENTITLED = ['active', 'trialing']

/** Pure: what kind of confirmation (if any) this sync result deserves. */
export function confirmationKind(result: SyncResult): 'new' | 'change' | null {
  if (result.outcome !== 'updated' || !result.subscription) return null
  const { planBefore, planAfter, subscription: s } = result
  // Grandfathered cohorts are never billed here: their plan doesn't move, and
  // they get no purchase confirmation even if a Stripe subscription appears.
  if (planBefore === 'founding' || planBefore === 'alpha') return null
  if (!planAfter || !PAID.includes(planAfter)) return null
  if (!ENTITLED.includes(s.status)) return null
  // A subscription already set to end isn't a purchase worth confirming.
  if (s.cancelAtPeriodEnd) return null
  if (s.idBefore !== s.idAfter) return 'new'
  if (planBefore !== planAfter) return 'change'
  return null
}

export async function sendSubscriptionConfirmation(db: Db, result: SyncResult): Promise<void> {
  try {
    const kind = confirmationKind(result)
    if (!kind || result.outcome !== 'updated' || !result.subscription || !result.planAfter) return

    const { data, error } = await db.auth.admin.getUserById(result.profileId)
    const to = data?.user?.email
    if (error || !to) {
      console.error('[billingEmail] no recipient for', result.profileId, error?.message ?? '')
      return
    }

    const email = subscriptionConfirmationEmail({
      plan: result.planAfter,
      kind,
      nextChargeAt: result.subscription.currentPeriodEnd,
    })
    if (!email) return

    const s = result.subscription
    const outcome = await sendBillingEmail({
      to,
      ...email,
      idempotencyKey: `sub-confirm:${s.idAfter}:${s.priceId ?? 'none'}:${result.planBefore ?? 'none'}`,
    })
    if (!outcome.sent) console.error(`[billingEmail] confirmation not sent (${outcome.reason}) for ${result.profileId}`)
  } catch (err: any) {
    console.error('[billingEmail] unexpected failure:', err?.message ?? err)
  }
}
