import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getStripe } from '../../../../lib/stripe'
import { createAdminSupabase } from '../../../../lib/supabase-admin'
import { billingAutomationEnabled } from '../../../../lib/billing'
import { stripeKeyIsLive, syncInvoice, syncSubscription, type SyncResult } from '../../../../lib/stripeSync'
import { sendSubscriptionConfirmation } from '../../../../lib/billingEmail'

// Stripe signature verification needs the raw body and Node crypto.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ── Stripe webhook ───────────────────────────────────────────────────────────
//
// Observe-only while BILLING_AUTOMATION_ENABLED is not 'true': every verified
// event is recorded in stripe_webhook_events and nothing else happens.
//
// Order of operations, and why:
//   1. Verify the signature. Unsigned/forged payloads never get past here.
//   2. Ignore events from the other mode (a live event hitting a test key, or
//      vice versa) — they refer to objects this key cannot see.
//   3. Claim the event id in stripe_webhook_events (PK = idempotency). A
//      redelivery of an event already PROCESSED short-circuits. A redelivery
//      of one that was claimed but whose write failed (processed_at NULL) is
//      processed again — that is Stripe's retry doing its job.
//   4. Only if the kill switch is on: re-read the subscription/invoice from
//      Stripe and write the profile (lib/stripeSync.ts).
//   5. Mark processed_at only after the write succeeded. Any failure → 500,
//      so Stripe retries. Every write is absolute, so a retry is harmless.

const SUBSCRIPTION_EVENTS = new Set([
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
])

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

  const stripe = getStripe()
  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret)
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  // ── Mode guard ─────────────────────────────────────────────────────────────
  if (event.livemode !== stripeKeyIsLive()) {
    console.warn(`[stripe/webhook] ignoring ${event.id}: livemode=${event.livemode} does not match the secret key's mode`)
    return NextResponse.json({ ok: true, ignored: 'livemode_mismatch' })
  }

  const supabase = createAdminSupabase()
  const automationOn = billingAutomationEnabled()
  const now = () => new Date().toISOString()

  // ── Idempotency claim ──────────────────────────────────────────────────────
  const { error: claimError } = await supabase
    .from('stripe_webhook_events')
    .insert({
      event_id: event.id,
      type: event.type,
      livemode: event.livemode,
      automation_enabled: automationOn,
      acted: false,
      payload_summary: summarize(event),
      // Observe-only: recording it IS the whole job.
      processed_at: automationOn ? null : now(),
    })

  if (claimError) {
    if ((claimError as { code?: string }).code !== '23505') {
      // Do NOT act without a claim. 500 → Stripe retries.
      console.error('[stripe/webhook] ledger insert failed:', claimError.message)
      return NextResponse.json({ error: 'Ledger write failed' }, { status: 500 })
    }
    // Seen before. Done, unless the earlier attempt never finished.
    const { data: prior, error: readError } = await supabase
      .from('stripe_webhook_events')
      .select('processed_at')
      .eq('event_id', event.id)
      .maybeSingle()
    if (readError) {
      console.error('[stripe/webhook] ledger read failed:', readError.message)
      return NextResponse.json({ error: 'Ledger read failed' }, { status: 500 })
    }
    if (prior?.processed_at) {
      console.log('[stripe/webhook] duplicate event, already processed:', event.id)
      return NextResponse.json({ ok: true, duplicate: true })
    }
    console.log('[stripe/webhook] retrying unprocessed event:', event.id)
  }

  console.log(
    `[stripe/webhook] ${event.type} | id=${event.id} | livemode=${event.livemode} | automation=${automationOn ? 'ON' : 'OFF'}`
  )

  // ── KILL SWITCH ────────────────────────────────────────────────────────────
  if (!automationOn) {
    if (claimError) {
      // A retry of an event claimed while automation was on, now off: record
      // it as observed and stop.
      await supabase.from('stripe_webhook_events').update({ processed_at: now() }).eq('event_id', event.id)
    }
    console.log('[stripe/webhook] automation disabled — logged only, no entitlement change')
    return NextResponse.json({ ok: true, observed: true, acted: false })
  }

  // ── Entitlement application ────────────────────────────────────────────────
  let result: SyncResult | null = null
  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session
      const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id
      if (session.mode === 'subscription' && subscriptionId) {
        result = await syncSubscription(supabase, stripe, subscriptionId, {
          userId: session.client_reference_id || session.metadata?.agent_id || null,
          customerId: typeof session.customer === 'string' ? session.customer : session.customer?.id ?? null,
        })
      }
    } else if (SUBSCRIPTION_EVENTS.has(event.type)) {
      const sub = event.data.object as Stripe.Subscription
      result = await syncSubscription(supabase, stripe, sub.id)
    } else if (event.type === 'invoice.payment_failed' || event.type === 'invoice.paid') {
      const invoice = event.data.object as Stripe.Invoice
      if (invoice.id) {
        result = await syncInvoice(supabase, stripe, invoice.id, event.type === 'invoice.paid' ? 'paid' : 'failed', event.created)
      }
    }
  } catch (err: any) {
    // Stripe API error, network failure, etc. Not processed → Stripe retries.
    console.error(`[stripe/webhook] ${event.id} handler threw:`, err?.message)
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 })
  }

  if (result?.outcome === 'error') {
    console.error(`[stripe/webhook] ${event.id} not processed: ${result.message}`)
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 })
  }

  // Best-effort confirmation email (new subscription / plan change to a paid
  // plan). Never throws and never changes the outcome. Sent BEFORE the ledger
  // is marked so a failed mark (→ retry) can't lose it: the retry finds the
  // profile already updated and sends nothing further.
  if (result) await sendSubscriptionConfirmation(supabase, result)

  const acted = result?.outcome === 'updated'
  const { error: markError } = await supabase
    .from('stripe_webhook_events')
    .update({ processed_at: now(), acted })
    .eq('event_id', event.id)
  if (markError) {
    // The profile write landed but we could not record it. A retry re-applies
    // the same absolute values, so 500 is safe and keeps the ledger honest.
    console.error('[stripe/webhook] could not mark processed:', markError.message)
    return NextResponse.json({ error: 'Ledger update failed' }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    acted,
    ...(result?.outcome === 'skipped' ? { skipped: result.reason } : {}),
  })
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
