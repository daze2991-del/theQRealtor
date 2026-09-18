import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getStripe } from '../../../../lib/stripe'
import { createAdminSupabase } from '../../../../lib/supabase-admin'
import { billingAutomationEnabled } from '../../../../lib/billing'
import { subscriptionPatch } from '../../../../lib/subscription'

// ── Stripe webhook — OBSERVE-ONLY while billing automation is disabled ────────
//
// Production billing is MANUAL. The founder sets profiles.plan /
// account_status by hand. This endpoint exists so Stripe can *tell us* things
// happened; it must not *act* on them until BILLING_AUTOMATION_ENABLED === 'true'.
//
// Order of operations, and why:
//   1. Verify the signature. Unsigned/forged payloads never get past here.
//   2. Claim the event id in stripe_webhook_events. The PK makes Stripe's
//      at-least-once retries idempotent — a duplicate delivery short-circuits.
//   3. ONLY THEN, and only if the kill switch is on, apply entitlement changes.
//
// Step 3 is the only place that writes entitlements, and it is unreachable
// while the switch is off. There is no other branch in this file that touches
// profiles.

export async function POST(request: Request) {
  const body = await request.text()
  const sig = request.headers.get('stripe-signature')

  if (!sig) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) {
    console.error('[stripe/webhook] STRIPE_WEBHOOK_SECRET not set — rejecting')
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
  }

  let event: Stripe.Event
  try {
    event = getStripe().webhooks.constructEvent(body, sig, webhookSecret)
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const supabase = createAdminSupabase()
  const automationOn = billingAutomationEnabled()

  // ── Idempotency claim ──────────────────────────────────────────────────────
  // Insert first. A duplicate event_id (Stripe retry, or a replayed delivery)
  // violates the PK and we stop here without re-processing.
  const summary = summarize(event)
  const { error: claimError } = await supabase
    .from('stripe_webhook_events')
    .insert({
      event_id: event.id,
      type: event.type,
      livemode: event.livemode,
      automation_enabled: automationOn,
      acted: false,
      payload_summary: summary,
    })

  if (claimError) {
    // 23505 = unique_violation → already seen this event id. Idempotent no-op.
    if ((claimError as { code?: string }).code === '23505') {
      console.log('[stripe/webhook] duplicate event, already processed:', event.id)
      return NextResponse.json({ ok: true, duplicate: true })
    }
    // Any other insert failure: do NOT proceed to act. Returning 500 makes
    // Stripe retry, which is safe precisely because the claim is idempotent.
    console.error('[stripe/webhook] ledger insert failed:', claimError.message)
    return NextResponse.json({ error: 'Ledger write failed' }, { status: 500 })
  }

  console.log(
    `[stripe/webhook] ${event.type} | id=${event.id} | livemode=${event.livemode} | automation=${automationOn ? 'ON' : 'OFF'}`
  )

  // ── KILL SWITCH ────────────────────────────────────────────────────────────
  // Everything above is observation. Everything below mutates entitlements.
  if (!automationOn) {
    console.log('[stripe/webhook] automation disabled — logged only, no entitlement change')
    return NextResponse.json({ ok: true, observed: true, acted: false })
  }

  // ── Entitlement application (unreachable while the switch is off) ──────────
  // Records what Stripe reports about a subscription's status, period and
  // scheduled cancellation. Events that arrive without a handler here are
  // recorded in the ledger and ignored.
  //
  // STILL DELIBERATELY NOT IMPLEMENTED: nothing below writes profiles.plan.
  // Auto-upgrade and auto-downgrade remain parked pending legal review of
  // California's ARL — see lib/billing.ts and the TODO(ARL) in the checkout
  // route. These handlers fill in status/period data only. An agent's
  // entitlements still come from plan/account_status, still set by hand.
  let acted = false

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    // Must match exactly what app/api/stripe/checkout/route.ts stamps on the
    // session: metadata.agent_id (and client_reference_id, same value). This
    // previously read metadata.userId, a key the checkout route has never set
    // — so attribution silently failed on every completed checkout.
    const agentId = session.metadata?.agent_id
    if (agentId) {
      const { error } = await supabase
        .from('profiles')
        .update({
          stripe_customer_id: session.customer as string,
          stripe_subscription_id: session.subscription as string,
        })
        .eq('id', agentId)
      if (error) console.error('[stripe/webhook] profile update failed:', error.message)
      else acted = true
    } else {
      console.warn('[stripe/webhook] checkout.session.completed without metadata.agent_id — cannot attribute')
    }
  }

  // ── Subscription lifecycle ─────────────────────────────────────────────────
  // created / updated / deleted all carry a complete Subscription object, so
  // one handler covers all three. A cancellation is NOT a .deleted event —
  // verified live 2026-09-16: cancelling via the billing portal emits .updated
  // with status still 'active' and cancel_at set. .deleted arrives only when
  // the subscription actually ends (or the customer is removed).
  if (
    event.type === 'customer.subscription.created' ||
    event.type === 'customer.subscription.updated' ||
    event.type === 'customer.subscription.deleted'
  ) {
    const sub = event.data.object as Stripe.Subscription
    const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id ?? null

    const agentId = await resolveAgentId(supabase, {
      metadataAgentId: sub.metadata?.agent_id ?? null,
      subscriptionId: sub.id,
      customerId,
    })

    if (agentId) {
      // stripe_customer_id / stripe_subscription_id are written here as well as
      // in checkout.session.completed, and that redundancy is load-bearing:
      // delivery order between those two events is NOT guaranteed. Measured on
      // 2026-09-16, customer.subscription.created arrived 76ms BEFORE
      // checkout.session.completed on one checkout and in the same millisecond
      // on another. Whichever lands first leaves the row complete; the second
      // writes identical values.
      const { error } = await supabase
        .from('profiles')
        .update({
          ...subscriptionPatch(sub),
          stripe_customer_id: customerId,
          stripe_subscription_id: sub.id,
        })
        .eq('id', agentId)

      if (error) console.error(`[stripe/webhook] ${event.type} profile update failed:`, error.message)
      else acted = true
    } else {
      console.warn(
        `[stripe/webhook] ${event.type} — no profile matches metadata.agent_id, subscription ${sub.id}, or customer ${customerId}. Logged, not applied.`
      )
    }
  }

  // ── Failed payment ─────────────────────────────────────────────────────────
  // Records THAT a renewal charge failed and when. Deliberately does not write
  // subscription_status: the customer.subscription.updated that accompanies
  // this event carries Stripe's authoritative status (past_due / unpaid), and
  // inferring a status here would race with it and could overwrite the real one
  // with a guess. This is not a dunning system — no retry schedule, no access
  // change, no email. It only stops the event from vanishing.
  if (event.type === 'invoice.payment_failed') {
    const invoice = event.data.object as Stripe.Invoice
    // On API version 2026-04-22.dahlia the invoice's subscription is NOT at the
    // root — it is nested under parent.subscription_details. `invoice.subscription`
    // does not exist in the SDK's Invoice interface on this version.
    const subDetails = invoice.parent?.subscription_details ?? null
    const subRef = subDetails?.subscription ?? null
    const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id ?? null

    // Stripe snapshots the subscription's metadata onto the invoice at
    // finalization, so agent_id is available here without a Stripe round-trip.
    // This is load-bearing, not a nicety: measured 2026-09-18, this event
    // arrived while the profile still had no stripe_customer_id or
    // stripe_subscription_id, because customer.subscription.created had not
    // been processed yet. Resolving by those columns alone found no profile and
    // dropped the write — the same ordering race the subscription handler
    // already defends against.
    const agentId = await resolveAgentId(supabase, {
      metadataAgentId: subDetails?.metadata?.agent_id ?? null,
      subscriptionId: typeof subRef === 'string' ? subRef : subRef?.id ?? null,
      customerId,
    })

    if (agentId) {
      const { error } = await supabase
        .from('profiles')
        .update({ last_payment_failed_at: new Date(event.created * 1000).toISOString() })
        .eq('id', agentId)

      if (error) console.error('[stripe/webhook] invoice.payment_failed update failed:', error.message)
      else acted = true
    } else {
      console.warn(
        `[stripe/webhook] invoice.payment_failed — no profile matches subscription ${String(subRef)} or customer ${customerId}. Logged, not applied.`
      )
    }
  }

  if (acted) {
    await supabase.from('stripe_webhook_events').update({ acted: true }).eq('event_id', event.id)
  }

  return NextResponse.json({ ok: true, acted })
}

// ── Agent attribution ────────────────────────────────────────────────────────
// Tries the identifiers in descending order of reliability and returns the
// first that matches a REAL profile row:
//
//   1. subscription.metadata.agent_id — stamped by the checkout route onto the
//      subscription itself, so it survives regardless of event ordering.
//      Absent on any subscription created before that was added.
//   2. stripe_subscription_id
//   3. stripe_customer_id
//
// Every candidate is confirmed against profiles before being returned, so a
// stale id from a deleted test account reports "not applied" instead of
// silently updating zero rows and claiming success.
async function resolveAgentId(
  supabase: ReturnType<typeof createAdminSupabase>,
  ids: { metadataAgentId: string | null; subscriptionId: string | null; customerId: string | null }
): Promise<string | null> {
  const candidates: Array<{ column: string; value: string }> = []
  if (ids.metadataAgentId) candidates.push({ column: 'id', value: ids.metadataAgentId })
  if (ids.subscriptionId) candidates.push({ column: 'stripe_subscription_id', value: ids.subscriptionId })
  if (ids.customerId) candidates.push({ column: 'stripe_customer_id', value: ids.customerId })

  for (const { column, value } of candidates) {
    const { data, error } = await supabase.from('profiles').select('id').eq(column, value).limit(1)
    if (error) {
      console.error(`[stripe/webhook] agent lookup by ${column} failed:`, error.message)
      continue
    }
    if (data && data.length > 0) return data[0].id as string
  }
  return null
}

// Small, non-sensitive digest for the ledger. Never store full payloads — they
// can contain customer PII we have no reason to retain.
function summarize(event: Stripe.Event): Record<string, unknown> {
  const obj = event.data.object as unknown as Record<string, unknown>

  // Where the subscription id lives depends on the object type, and on API
  // version 2026-04-22.dahlia none of them is a root `subscription` string on
  // the two shapes we care about most:
  //   • a Subscription   → the id IS the object's own id
  //   • an Invoice       → parent.subscription_details.subscription
  //   • everything else  → a root `subscription` string, when present at all
  // Reading only the last case is why every invoice row in the ledger before
  // this change recorded a null subscription.
  let subscription: string | null = null
  if (obj.object === 'subscription') {
    subscription = typeof obj.id === 'string' ? obj.id : null
  } else if (obj.object === 'invoice') {
    const parent = obj.parent as { subscription_details?: { subscription?: unknown } } | null | undefined
    const ref = parent?.subscription_details?.subscription
    subscription = typeof ref === 'string' ? ref : (ref as { id?: string } | undefined)?.id ?? null
  } else if (typeof obj.subscription === 'string') {
    subscription = obj.subscription
  }

  return {
    object: (obj.object as string) ?? null,
    status: (obj.status as string) ?? null,
    customer: typeof obj.customer === 'string' ? obj.customer : null,
    subscription,
    created: event.created,
  }
}
