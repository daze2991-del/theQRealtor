// ── Resend email helpers ─────────────────────────────────────────────────────
// Mirrors lib/twilio.ts's shape: message templates + a send wrapper that
// never throws and never blocks lead capture. Server-side only.
//
// Sender: alerts@theqrealtor.com (display name "theQRealtor"), Reply-To
// hello@theqrealtor.com — kept separate from the Namecheap Private Email
// mailbox at hello@ so this service's own DNS (SPF/DKIM) never has to be
// merged into that mailbox's.
//
// FAILS SAFE in every direction: no RESEND_API_KEY → log + no-op (so a
// missing env var in a preview/dev environment never throws). Any Resend
// error is caught and logged, never re-thrown — a failed or slow email must
// never fail or delay the lead write it's reporting on (same contract as
// sendSmsDetailed in lib/twilio.ts).

import 'server-only'
import { Resend } from 'resend'
import { featuresForPlan } from './plans'
import { leadUrl } from './twilio'
import { dollars, pricingTierConfig, isPricingTier } from './pricing'

const FROM = 'theQRealtor <alerts@theqrealtor.com>'
const REPLY_TO = 'hello@theqrealtor.com'

export type EmailSkipReason =
  | 'not_configured'   // RESEND_API_KEY missing
  | 'plan_restricted'  // agent's plan has canUseEmailAlerts = false
  | 'alerts_off'       // profiles.email_alerts_enabled = false
  | 'no_recipient'     // no account email resolved
  | 'send_failed'      // Resend accepted the call but returned an error

export type SendAgentAlertEmailResult =
  | { sent: true; id: string }
  | { sent: false; reason: EmailSkipReason }

function resendClient(): Resend | null {
  const key = process.env.RESEND_API_KEY
  if (!key) return null
  return new Resend(key)
}

// ── Templates ─────────────────────────────────────────────────────────────────
// Content mirrors the SMS alert wording (lib/twilio.ts msg.showingAlert /
// questionAlert): request type, buyer name + contact details, property
// address, a link to the lead. Plain and simple — one footer line, no
// marketing. Never includes score/tier/breakdown data; callers only ever
// pass buyer-submitted fields and the property address.
function footer(): string {
  return "You're getting this because email alerts are on. Change this in Settings."
}

function wrap(subject: string, lines: string[]): { subject: string; text: string; html: string } {
  const text = [...lines, '', footer()].join('\n')
  const settingsUrl = `${(process.env.NEXT_PUBLIC_APP_URL || 'https://theqrealtor.com').replace(/\/$/, '')}/dashboard/settings`
  const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const html = `<!doctype html><html><body style="font-family:-apple-system,Helvetica,Arial,sans-serif;color:#1a1a1a;line-height:1.6;max-width:480px;margin:0 auto;padding:24px 16px">
${lines.map(l => l ? `<p style="margin:0 0 12px">${escape(l).replace(/(https?:\/\/\S+)/g, '<a href="$1" style="color:#7C3AED">$1</a>')}</p>` : '').join('\n')}
<hr style="border:none;border-top:1px solid #e5e5e5;margin:20px 0">
<p style="margin:0;font-size:12px;color:#6B7280">You're getting this because email alerts are on. <a href="${settingsUrl}" style="color:#6B7280">Change this in Settings</a>.</p>
</body></html>`
  return { subject, text, html }
}

export const emailMsg = {
  showingAlert(
    buyer: string, address: string, leadId: string,
    buyerPhone?: string | null, buyerEmail?: string | null, contactPreference?: string | null,
  ) {
    const contact = buyerPhone?.trim()
      ? buyerPhone.trim()
      : buyerEmail?.trim() ? buyerEmail.trim() : 'no contact info provided'
    return wrap(`New showing request — ${address}`, [
      `${buyer} wants to see ${address}.`,
      `Contact: ${contact}${contactPreference ? ` (prefers ${contactPreference})` : ''}`,
      `View this lead: ${leadUrl(leadId)}`,
    ])
  },
  questionAlert(buyer: string, address: string, leadId: string, buyerPhone?: string | null, buyerEmail?: string | null) {
    const contact = buyerPhone?.trim()
      ? buyerPhone.trim()
      : buyerEmail?.trim() ? buyerEmail.trim() : 'no contact info provided'
    return wrap(`New question — ${address}`, [
      `${buyer} asked a question about ${address}.`,
      `Contact: ${contact}`,
      `View this lead: ${leadUrl(leadId)}`,
    ])
  },
}

// ── Send ──────────────────────────────────────────────────────────────────────
export async function sendAgentAlertEmail(opts: {
  to: string | null | undefined
  plan: string | null | undefined
  emailAlertsEnabled: boolean
  subject: string
  text: string
  html: string
}): Promise<SendAgentAlertEmailResult> {
  const { to, plan, emailAlertsEnabled, subject, text, html } = opts

  if (!featuresForPlan(plan).canUseEmailAlerts) return { sent: false, reason: 'plan_restricted' }
  if (!emailAlertsEnabled) return { sent: false, reason: 'alerts_off' }
  if (!to) return { sent: false, reason: 'no_recipient' }

  const resend = resendClient()
  if (!resend) {
    console.warn('[email] RESEND_API_KEY not set — skipping agent alert email')
    return { sent: false, reason: 'not_configured' }
  }

  try {
    const { data, error } = await resend.emails.send({
      from: FROM, to, replyTo: REPLY_TO, subject, text, html,
    })
    if (error || !data) {
      console.error('[email] send failed:', error?.message ?? 'no data returned')
      return { sent: false, reason: 'send_failed' }
    }
    return { sent: true, id: data.id }
  } catch (err: any) {
    // Never throw — a failed email must never fail or delay the lead write.
    console.error('[email] send threw:', err?.message ?? err)
    return { sent: false, reason: 'send_failed' }
  }
}

// ── Billing / subscription confirmation ──────────────────────────────────────
// Transactional, not an alert: it ignores profiles.email_alerts_enabled and the
// plan's canUseEmailAlerts, and carries its own footer. Reuses the same Resend
// client, sender and Reply-To as the alert emails. Never throws.

const SUPPORT_EMAIL = 'hello@theqrealtor.com'

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || 'https://theqrealtor.com').replace(/\/$/, '')
}

function longDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })
}

function wrapBilling(subject: string, lines: string[]): { subject: string; text: string; html: string } {
  const foot = `You're getting this because you subscribed to theQRealtor. Questions? Email ${SUPPORT_EMAIL}.`
  const text = [...lines, '', foot].join('\n')
  const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const html = `<!doctype html><html><body style="font-family:-apple-system,Helvetica,Arial,sans-serif;color:#1a1a1a;line-height:1.6;max-width:480px;margin:0 auto;padding:24px 16px">
${lines.map(l => l ? `<p style="margin:0 0 12px">${escape(l).replace(/(https?:\/\/\S+)/g, '<a href="$1" style="color:#7C3AED">$1</a>')}</p>` : '').join('\n')}
<hr style="border:none;border-top:1px solid #e5e5e5;margin:20px 0">
<p style="margin:0;font-size:12px;color:#6B7280">${escape(foot)}</p>
</body></html>`
  return { subject, text, html }
}

/**
 * Repeats the auto-renewal terms after a purchase: plan, price, monthly
 * auto-renewal, next charge date, how to cancel online, support contact.
 * `plan` must be a paid tier key; the price comes from the pricing catalog.
 */
export function subscriptionConfirmationEmail(o: {
  plan: string
  kind: 'new' | 'change'
  /** ISO timestamp of the next charge (current period end), if known. */
  nextChargeAt: string | null
}): { subject: string; text: string; html: string } | null {
  if (!isPricingTier(o.plan)) return null
  const { displayName, priceCents } = pricingTierConfig(o.plan)
  const price = dollars(priceCents)
  const billingUrl = `${appUrl()}/dashboard/billing`
  return wrapBilling(
    o.kind === 'new'
      ? `Your theQRealtor ${displayName} subscription is confirmed`
      : `Your theQRealtor plan is now ${displayName}`,
    [
      o.kind === 'new'
        ? `Thanks for subscribing — your ${displayName} plan is active.`
        : `Your plan has been changed to ${displayName}.`,
      `Plan: ${displayName} — ${price} per month`,
      `Automatic renewal: your subscription renews automatically every month until you cancel, and your card is charged ${price} each month on your renewal date.`,
      o.nextChargeAt
        ? `Next charge: ${price} on ${longDate(o.nextChargeAt)}.`
        : `Your next charge of ${price} is on your next renewal date.`,
      `Cancel anytime online: sign in, open ${billingUrl} and choose Manage Subscription. Cancellation takes effect at the end of the period you have already paid for. Under our Terms, all fees are non-refundable, including for partial months, except as required by law.`,
      `Questions? Email ${SUPPORT_EMAIL}.`,
    ],
  )
}

export type SendBillingEmailResult = { sent: true; id: string } | { sent: false; reason: EmailSkipReason }

/** Best-effort transactional send. `idempotencyKey` makes a retry a no-op at Resend. */
export async function sendBillingEmail(opts: {
  to: string | null | undefined
  subject: string
  text: string
  html: string
  idempotencyKey?: string
}): Promise<SendBillingEmailResult> {
  if (!opts.to) return { sent: false, reason: 'no_recipient' }
  const resend = resendClient()
  if (!resend) {
    console.warn('[email] RESEND_API_KEY not set — skipping billing email')
    return { sent: false, reason: 'not_configured' }
  }
  try {
    const { data, error } = await resend.emails.send(
      { from: FROM, to: opts.to, replyTo: REPLY_TO, subject: opts.subject, text: opts.text, html: opts.html },
      opts.idempotencyKey ? { idempotencyKey: opts.idempotencyKey } : undefined,
    )
    if (error || !data) {
      console.error('[email] billing send failed:', error?.message ?? 'no data returned')
      return { sent: false, reason: 'send_failed' }
    }
    return { sent: true, id: data.id }
  } catch (err: any) {
    console.error('[email] billing send threw:', err?.message ?? err)
    return { sent: false, reason: 'send_failed' }
  }
}
