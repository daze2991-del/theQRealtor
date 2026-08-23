import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getStripe } from '../../../../lib/stripe'
import { createAdminSupabase } from '../../../../lib/supabase-admin'
import { billingAutomationEnabled } from '../../../../lib/billing'

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
  // Intentionally minimal and additive-only for now. Upgrade/downgrade,
  // cancellation, dunning and trial handling are deliberately NOT implemented
  // pending legal review of California's ARL — see the deferred list. Events
  // that arrive without a handler here are recorded in the ledger and ignored.
  let acted = false

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    const userId = session.metadata?.userId
    if (userId) {
      const { error } = await supabase
        .from('profiles')
        .update({
          stripe_customer_id: session.customer as string,
          stripe_subscription_id: session.subscription as string,
        })
        .eq('id', userId)
      if (error) console.error('[stripe/webhook] profile update failed:', error.message)
      else acted = true
    } else {
      console.warn('[stripe/webhook] checkout.session.completed without metadata.userId — cannot attribute')
    }
  }

  if (acted) {
    await supabase.from('stripe_webhook_events').update({ acted: true }).eq('event_id', event.id)
  }

  return NextResponse.json({ ok: true, acted })
}

// Small, non-sensitive digest for the ledger. Never store full payloads — they
// can contain customer PII we have no reason to retain.
function summarize(event: Stripe.Event): Record<string, unknown> {
  const obj = event.data.object as unknown as Record<string, unknown>
  return {
    object: (obj.object as string) ?? null,
    status: (obj.status as string) ?? null,
    customer: typeof obj.customer === 'string' ? obj.customer : null,
    subscription: typeof obj.subscription === 'string' ? obj.subscription : null,
    created: event.created,
  }
}
