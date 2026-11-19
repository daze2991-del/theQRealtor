// Batch 1 — Stripe billing core. Batch 2 — California auto-renewal consent.
// Mocked Stripe and Resend (no network, no keys) and the real plan-locking
// migrations (059–063, 067) plus 038's webhook ledger, 068 and 069's consent
// table in an in-memory Postgres, so every webhook write goes through
// trg_protect_profile_entitlements and the 067 downgrade trigger for real.

import { readFileSync, readdirSync } from 'fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makePlanDb } from './helpers/planDb'
import { makePgSupabase } from './helpers/pgSupabase'
import { consentPayload, autoRenewalConsentText, AUTO_RENEWAL_CONSENT_VERSION, changeKind, type ConsentKind } from '../lib/autoRenewal'

vi.mock('server-only', () => ({}))

let t: Awaited<ReturnType<typeof makePlanDb>>
let pg: ReturnType<typeof makePgSupabase>
let currentUser: { id: string; email: string } | null = null

vi.mock('../lib/supabase-admin', () => ({ createAdminSupabase: () => pg.client }))
vi.mock('../lib/supabase-server', () => ({
  createServerSupabase: () => ({
    auth: { getUser: async () => ({ data: { user: currentUser } }) },
    from: (table: string) => pg.client.from(table),
  }),
}))

// ── Fake Stripe ──────────────────────────────────────────────────────────────
const subs = new Map<string, any>()
const invoices = new Map<string, any>()
let stripeDown = false
// How the next immediate-charge (always_invoice) update's payment goes:
// 'ok' | 'pending' (Stripe leaves the change in pending_update) | 'card_error'
// (Stripe rejects the request with a 402 card error).
let upgradeCharge: 'ok' | 'pending' | 'card_error' = 'ok'
// Live Stripe Prices as the verification step sees them (reset every test).
const priceCatalog = new Map<string, any>()
const stripe = {
  webhooks: {
    constructEvent: (body: string, sig: string) => {
      if (sig !== 'good-sig') throw new Error('bad signature')
      return JSON.parse(body)
    },
  },
  subscriptions: {
    retrieve: vi.fn(async (id: string) => {
      if (stripeDown) throw new Error('Stripe unavailable')
      const s = subs.get(id)
      if (!s) throw Object.assign(new Error(`No such subscription: ${id}`), { code: 'resource_missing' })
      return structuredClone(s)
    }),
    list: vi.fn(async ({ customer }: { customer: string }) => {
      if (stripeDown) throw new Error('Stripe unavailable')
      return { data: [...subs.values()].filter(s => s.customer === customer).map(s => structuredClone(s)) }
    }),
    update: vi.fn(async (id: string, params: any) => {
      const s = subs.get(id)
      // Mirrors payment_behavior: 'pending_if_incomplete': if the immediate
      // proration charge fails, the items are NOT changed.
      if (params.proration_behavior === 'always_invoice' && params.payment_behavior === 'pending_if_incomplete') {
        if (upgradeCharge === 'card_error') {
          throw Object.assign(new Error('Your card was declined.'), { type: 'StripeCardError', statusCode: 402 })
        }
        if (upgradeCharge === 'pending') {
          s.pending_update = { subscription_items: [{ price: params.items[0].price }], expires_at: PERIOD_END }
          return structuredClone(s)
        }
      }
      s.items.data[0].price = price(params.items[0].price)
      s.pending_update = null
      return structuredClone(s)
    }),
    create: vi.fn(),
  },
  prices: {
    retrieve: vi.fn(async (id: string) => {
      if (stripeDown) throw new Error('Stripe unavailable')
      const p = priceCatalog.get(id)
      if (!p) throw Object.assign(new Error(`No such price: ${id}`), { code: 'resource_missing' })
      return structuredClone(p)
    }),
  },
  invoices: { retrieve: vi.fn(async (id: string) => structuredClone(invoices.get(id))) },
  checkout: { sessions: { create: vi.fn(async () => ({ url: 'https://checkout.stripe.test/session' })) } },
  billingPortal: { sessions: { create: vi.fn(async () => ({ url: 'https://billing.stripe.test/portal' })) } },
}
vi.mock('../lib/stripe', () => ({ getStripe: () => stripe }))

// Resend — the real lib/email.ts runs; only the network client is replaced.
const sendEmail = vi.fn()
vi.mock('resend', () => ({ Resend: vi.fn(() => ({ emails: { send: sendEmail } })) }))

import { POST as webhook } from '../app/api/stripe/webhook/route'
import { POST as checkout } from '../app/api/stripe/checkout/route'
import { POST as changePlan } from '../app/api/stripe/change-plan/route'
import { POST as portal } from '../app/api/stripe/portal/route'
import { planForPriceId, isPricingTier } from '../lib/pricing'

const P = {
  starter: 'price_starter_monthly',
  pro: 'price_pro_monthly',
  starterYear: 'price_starter_yearly',
  proYear: 'price_pro_yearly',
  unknown: 'price_some_other_product',
}
const PERIOD_END = 1_900_000_000

function price(id: string) {
  return { id, recurring: { interval: id.endsWith('yearly') ? 'year' : 'month' } }
}
function makeSub(id: string, o: { customer: string; status?: string; price?: string; agent?: string; cancelAtPeriodEnd?: boolean }) {
  const s = {
    id, object: 'subscription', customer: o.customer, status: o.status ?? 'active',
    cancel_at_period_end: o.cancelAtPeriodEnd ?? false, cancel_at: null as number | null, trial_end: null as number | null,
    metadata: o.agent ? { agent_id: o.agent } : {},
    items: { data: [{ id: `si_${id}`, price: price(o.price ?? P.starter), current_period_end: PERIOD_END }] },
  }
  subs.set(id, s)
  return s
}
let seq = 0
function evt(type: string, object: any, o: { id?: string; livemode?: boolean } = {}) {
  return { id: o.id ?? `evt_${++seq}`, object: 'event', type, livemode: o.livemode ?? false, created: 1_800_000_000 + seq, data: { object } }
}
const post = (event: any, sig = 'good-sig') =>
  webhook(new Request('http://test/api/stripe/webhook', { method: 'POST', headers: { 'stripe-signature': sig }, body: JSON.stringify(event) }))
const checkoutCompleted = (agent: string, customer: string, subId: string) =>
  evt('checkout.session.completed', { id: `cs_${subId}`, object: 'checkout.session', mode: 'subscription', client_reference_id: agent, metadata: { agent_id: agent }, customer, subscription: subId })
const subEvent = (type: string, subId: string, payloadOverrides: any = {}) =>
  evt(type, { ...structuredClone(subs.get(subId)), ...payloadOverrides })

/** The consent a browser would send for this tier, given the sub's current price. */
function consentFor(tier: 'starter' | 'pro', subId = 'sub_1') {
  const current = planForPriceId(subs.get(subId)?.items.data[0].price.id)
  return consentPayload(tier, changeKind(current, tier))
}
const checkoutBody = (tier: 'starter' | 'pro' = 'starter', extra: Record<string, unknown> = {}) =>
  ({ tier, interval: 'month', ...consentPayload(tier, 'new'), ...extra })

const profile = (id: string) => t.one(`select * from public.profiles where id = $1`, [id])
const ledger = (id: string) => t.one(`select * from public.stripe_webhook_events where event_id = $1`, [id])
async function linkStripe(agent: string, customer: string, subId: string | null) {
  await t.db.query(`update public.profiles set stripe_customer_id = $2, stripe_subscription_id = $3 where id = $1`, [agent, customer, subId])
}
async function crowd(agent: string, listings: number, signs: number) {
  for (let i = 0; i < listings; i++) await t.listing(agent, { scans: i })
  for (let i = 0; i < signs; i++) await t.sign(agent)
}

const src = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')

beforeEach(async () => {
  t = await makePlanDb()
  await t.db.exec(src('supabase/migrations/038_entitlements_and_billing_scaffold.sql'))
  await t.db.exec(src('supabase/migrations/068_stripe_webhook_processed_at.sql'))
  await t.db.exec(src('supabase/migrations/069_auto_renewal_consents.sql'))
  pg = makePgSupabase(t.db)
  subs.clear(); invoices.clear(); stripeDown = false; upgradeCharge = 'ok'; currentUser = null
  vi.clearAllMocks()
  sendEmail.mockReset()
  sendEmail.mockResolvedValue({ data: { id: 'email_1' }, error: null })
  priceCatalog.clear()
  for (const [id, cents, interval] of [[P.starter, 3900, 'month'], [P.pro, 6900, 'month'], [P.starterYear, 37440, 'year'], [P.proYear, 66240, 'year']] as const) {
    priceCatalog.set(id, { id, active: true, currency: 'usd', unit_amount: cents, recurring: { interval, interval_count: 1 } })
  }
  Object.assign(process.env, {
    RESEND_API_KEY: 're_fake', NEXT_PUBLIC_APP_URL: 'https://theqrealtor.com',
    STRIPE_SECRET_KEY: 'sk_test_fake', STRIPE_WEBHOOK_SECRET: 'whsec_fake',
    BILLING_AUTOMATION_ENABLED: 'true', PAID_PLANS_ENABLED: 'true', STRIPE_CHARGES_ENABLED: 'true',
    ANNUAL_BILLING_ENABLED: '',
    STRIPE_PRICE_ID_STARTER_MONTHLY: P.starter, STRIPE_PRICE_ID_PRO_MONTHLY: P.pro,
    STRIPE_PRICE_ID_STARTER_YEARLY: P.starterYear, STRIPE_PRICE_ID_PRO_YEARLY: P.proYear,
  })
})

// ── Price → plan ─────────────────────────────────────────────────────────────
describe('planForPriceId (server-side mapping from lib/pricing.ts env vars)', () => {
  it.each([[P.starter, 'starter'], [P.starterYear, 'starter'], [P.pro, 'pro'], [P.proYear, 'pro'],
    [P.unknown, null], ['', null], [null, null]])('%s → %s', (id, plan) => {
    expect(planForPriceId(id as any)).toBe(plan)
  })
})

// ── The protect trigger lets the service role through ───────────────────────
describe('trg_protect_profile_entitlements', () => {
  it('allows the service-role webhook writes, and still blocks a signed-in agent', async () => {
    const a = await t.agent('free')
    makeSub('sub_1', { customer: 'cus_1', agent: a })
    expect((await post(checkoutCompleted(a, 'cus_1', 'sub_1'))).status).toBe(200)
    expect((await profile(a)).plan).toBe('starter')

    await t.asRole('authenticated')
    await expect(t.db.query(`update public.profiles set plan = 'pro' where id = $1`, [a])).rejects.toThrow(/managed by the system/)
    await expect(t.db.query(`update public.profiles set subscription_status = 'x' where id = $1`, [a])).rejects.toThrow()
    await t.asRole(null)
  })
})

// ── Webhook scenarios ────────────────────────────────────────────────────────
describe('webhook sets the plan', () => {
  it('new Starter: checkout.session.completed → plan starter and every billing field', async () => {
    const a = await t.agent('trial')
    makeSub('sub_1', { customer: 'cus_1', agent: a })
    const e = checkoutCompleted(a, 'cus_1', 'sub_1')
    const res = await post(e)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, acted: true })

    const p = await profile(a)
    expect(p).toMatchObject({
      plan: 'starter', stripe_customer_id: 'cus_1', stripe_subscription_id: 'sub_1',
      subscription_status: 'active', price_id: P.starter, cancel_at_period_end: false,
      cancel_at: null, trial_end: null,
    })
    expect(new Date(p.current_period_end).getTime()).toBe(PERIOD_END * 1000)
    expect((await ledger(e.id))).toMatchObject({ acted: true })
    expect((await ledger(e.id)).processed_at).toBeTruthy()
  })

  it('subscription.created arriving first finds the agent by subscription metadata', async () => {
    const a = await t.agent('free')
    makeSub('sub_1', { customer: 'cus_1', agent: a, price: P.pro })
    await post(subEvent('customer.subscription.created', 'sub_1'))
    expect(await profile(a)).toMatchObject({ plan: 'pro', stripe_customer_id: 'cus_1', stripe_subscription_id: 'sub_1' })
  })

  it('falls back to stripe_customer_id when there is no user id anywhere', async () => {
    const a = await t.agent('starter')
    await linkStripe(a, 'cus_1', null)
    makeSub('sub_1', { customer: 'cus_1', price: P.pro })
    await post(subEvent('customer.subscription.updated', 'sub_1'))
    expect(await profile(a)).toMatchObject({ plan: 'pro', stripe_subscription_id: 'sub_1' })
  })

  it('cancel_at_period_end and cancel_at are stored (plan kept until it actually ends)', async () => {
    const a = await t.agent('pro')
    await linkStripe(a, 'cus_1', 'sub_1')
    const s = makeSub('sub_1', { customer: 'cus_1', price: P.pro, cancelAtPeriodEnd: true })
    s.cancel_at = PERIOD_END
    await post(subEvent('customer.subscription.updated', 'sub_1'))
    const p = await profile(a)
    expect(p).toMatchObject({ plan: 'pro', cancel_at_period_end: true })
    expect(new Date(p.cancel_at).getTime()).toBe(PERIOD_END * 1000)
  })
})

describe('Starter ↔ Pro uses ONE subscription', () => {
  async function starterAgent() {
    const a = await t.agent('free')
    makeSub('sub_1', { customer: 'cus_1', agent: a })
    await post(checkoutCompleted(a, 'cus_1', 'sub_1'))
    currentUser = { id: a, email: 'agent@example.test' }
    return a
  }
  const changeTo = (tier: unknown, extra: Record<string, unknown> = {}) =>
    changePlan(new Request('http://test/api/stripe/change-plan', {
      method: 'POST',
      body: JSON.stringify({ tier, ...(isPricingTier(tier) ? consentFor(tier) : {}), ...extra }),
    }))

  it('Starter → Pro: charges the prorated difference now (only applies if paid), one subscription, plan pro', async () => {
    const a = await starterAgent()
    const res = await changeTo('pro')
    expect(res.status).toBe(200)
    expect(stripe.subscriptions.update).toHaveBeenCalledTimes(1)
    expect(stripe.subscriptions.update).toHaveBeenCalledWith('sub_1', {
      items: [{ id: 'si_sub_1', price: P.pro }],
      proration_behavior: 'always_invoice',
      payment_behavior: 'pending_if_incomplete',
    })
    expect(stripe.subscriptions.create).not.toHaveBeenCalled()
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled()
    expect(await profile(a)).toMatchObject({ plan: 'pro', stripe_subscription_id: 'sub_1', price_id: P.pro })

    // The webhook that follows agrees.
    await post(subEvent('customer.subscription.updated', 'sub_1'))
    expect((await profile(a)).plan).toBe('pro')
    expect(subs.size).toBe(1)
  })

  it.each(['pending', 'card_error'] as const)('Starter → Pro with a failed charge (%s): 402, agent stays on Starter, webhook agrees', async mode => {
    const a = await starterAgent()
    upgradeCharge = mode
    const res = await changeTo('pro')
    expect(res.status).toBe(402)
    expect(await res.json()).toMatchObject({ code: 'upgrade_payment_failed' })
    expect(await profile(a)).toMatchObject({ plan: 'starter', price_id: P.starter })
    expect(subs.get('sub_1').items.data[0].price.id).toBe(P.starter)

    // Stripe's own events about it change nothing: the items are still Starter.
    await post(subEvent('customer.subscription.updated', 'sub_1'))
    expect((await profile(a)).plan).toBe('starter')
    expect(stripe.subscriptions.create).not.toHaveBeenCalled()
  })

  it('a pending upgrade that is paid later becomes Pro via the webhook', async () => {
    const a = await starterAgent()
    upgradeCharge = 'pending'
    expect((await changeTo('pro')).status).toBe(402)
    // Customer fixes their card; Stripe applies the pending update.
    subs.get('sub_1').items.data[0].price = price(P.pro)
    subs.get('sub_1').pending_update = null
    await post(subEvent('customer.subscription.updated', 'sub_1'))
    expect((await profile(a)).plan).toBe('pro')
  })

  it('Pro → Starter: no charge now; credited on the next invoice (create_prorations)', async () => {
    const a = await t.agent('free')
    makeSub('sub_1', { customer: 'cus_1', agent: a, price: P.pro })
    await post(checkoutCompleted(a, 'cus_1', 'sub_1'))
    currentUser = { id: a, email: 'agent@example.test' }
    upgradeCharge = 'card_error' // must be irrelevant: a downgrade charges nothing
    const res = await changeTo('starter')
    expect(res.status).toBe(200)
    expect(stripe.subscriptions.update).toHaveBeenCalledWith('sub_1', {
      items: [{ id: 'si_sub_1', price: P.starter }], proration_behavior: 'create_prorations',
    })
    expect((await profile(a)).plan).toBe('starter')
  })

  it('checkout is refused while that subscription exists (the double-charge path)', async () => {
    await starterAgent()
    const res = await checkout(new Request('http://test/api/stripe/checkout', { method: 'POST', body: JSON.stringify(checkoutBody('pro')) }))
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ code: 'existing_subscription' })
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled()
  })

  it('change-plan never accepts a raw price id, and only touches the session user\'s subscription', async () => {
    await starterAgent()
    expect((await changeTo(P.pro)).status).toBe(400)
    expect((await changeTo('pro', { priceId: P.unknown })).status).toBe(200)
    expect(stripe.subscriptions.update).toHaveBeenLastCalledWith('sub_1', expect.objectContaining({ items: [{ id: 'si_sub_1', price: P.pro }] }))
    currentUser = null
    expect((await changeTo('starter')).status).toBe(401)
  })

  it('change-plan refuses: same plan, no subscription, founding/alpha, inactive subscription', async () => {
    const a = await starterAgent()
    expect((await changeTo('starter')).status).toBe(409)

    const b = await t.agent('free'); currentUser = { id: b, email: 'b@example.test' }
    expect(await (await changeTo('pro')).json()).toMatchObject({ code: 'no_subscription' })

    const f = await t.agent('founding'); await linkStripe(f, 'cus_f', 'sub_f'); makeSub('sub_f', { customer: 'cus_f' })
    currentUser = { id: f, email: 'f@example.test' }
    expect((await changeTo('pro')).status).toBe(403)

    currentUser = { id: a, email: 'agent@example.test' }
    subs.get('sub_1').status = 'past_due'
    expect(await (await changeTo('pro')).json()).toMatchObject({ code: 'subscription_not_active' })
    expect(stripe.subscriptions.update).not.toHaveBeenCalled()
  })

  it('Pro → Starter: plan starter, and the chooser flag is set when over Starter limits', async () => {
    const a = await t.agent('free')
    makeSub('sub_1', { customer: 'cus_1', agent: a, price: P.pro })
    await post(checkoutCompleted(a, 'cus_1', 'sub_1'))
    expect((await profile(a)).plan).toBe('pro')
    await crowd(a, 5, 20)

    subs.get('sub_1').items.data[0].price = price(P.starter)
    await post(subEvent('customer.subscription.updated', 'sub_1'))

    const s = await t.state(a)
    expect(s.plan).toBe('starter')
    expect(s.plan_choice_required_at).toBeTruthy()
    expect(s.unlockedListings).toHaveLength(3)
    expect(s.unlockedSigns).toHaveLength(15)
    expect(s.totalListings).toBe(5)   // nothing deleted
    expect(s.totalSigns).toBe(20)
  })

  it('Pro → Starter within Starter limits sets no chooser flag', async () => {
    const a = await t.agent('pro'); await linkStripe(a, 'cus_1', 'sub_1')
    await crowd(a, 2, 4)
    makeSub('sub_1', { customer: 'cus_1', price: P.starter })
    await post(subEvent('customer.subscription.updated', 'sub_1'))
    const s = await t.state(a)
    expect(s.plan).toBe('starter')
    expect(s.plan_choice_required_at).toBeNull()
  })
})

describe('payment trouble', () => {
  it('past_due keeps the current plan and stores the status', async () => {
    const a = await t.agent('pro'); await linkStripe(a, 'cus_1', 'sub_1')
    makeSub('sub_1', { customer: 'cus_1', price: P.pro, status: 'past_due' })
    await post(subEvent('customer.subscription.updated', 'sub_1'))
    expect(await profile(a)).toMatchObject({ plan: 'pro', subscription_status: 'past_due' })
  })

  it('invoice.payment_failed stamps last_payment_failed_at; invoice.paid clears it', async () => {
    const a = await t.agent('starter'); await linkStripe(a, 'cus_1', 'sub_1')
    invoices.set('in_1', { id: 'in_1', customer: 'cus_1', status: 'open', parent: { subscription_details: { subscription: 'sub_1' } } })
    const failed = evt('invoice.payment_failed', { id: 'in_1', object: 'invoice' })
    await post(failed)
    expect(new Date((await profile(a)).last_payment_failed_at).getTime()).toBe(failed.created * 1000)
    expect((await profile(a)).plan).toBe('starter')

    invoices.get('in_1').status = 'paid'
    await post(evt('invoice.paid', { id: 'in_1', object: 'invoice' }))
    expect((await profile(a)).last_payment_failed_at).toBeNull()
  })

  it('a late payment_failed for an invoice that is now paid stamps nothing', async () => {
    const a = await t.agent('starter'); await linkStripe(a, 'cus_1', 'sub_1')
    invoices.set('in_1', { id: 'in_1', customer: 'cus_1', status: 'paid', parent: null })
    await post(evt('invoice.payment_failed', { id: 'in_1', object: 'invoice' }))
    expect((await profile(a)).last_payment_failed_at).toBeNull()
  })

  it.each(['canceled', 'unpaid', 'incomplete_expired'])('final state %s → plan free, chooser flag set, nothing deleted', async status => {
    const a = await t.agent('pro'); await linkStripe(a, 'cus_1', 'sub_1')
    await crowd(a, 4, 6)
    makeSub('sub_1', { customer: 'cus_1', price: P.pro, status })
    await post(subEvent('customer.subscription.updated', 'sub_1'))
    const s = await t.state(a)
    expect(s.plan).toBe('free')
    expect(s.plan_choice_required_at).toBeTruthy()
    expect(s.unlockedListings).toHaveLength(1)
    expect(s.unlockedSigns.length).toBeLessThanOrEqual(3)
    expect(s.totalListings).toBe(4)
    expect(s.totalSigns).toBe(6)
    expect((await profile(a))).toMatchObject({ subscription_status: status, stripe_subscription_id: 'sub_1' })
  })

  it('customer.subscription.deleted → plan free and the chooser', async () => {
    const a = await t.agent('starter'); await linkStripe(a, 'cus_1', 'sub_1')
    await crowd(a, 3, 5)
    makeSub('sub_1', { customer: 'cus_1', status: 'canceled' })
    const res = await post(subEvent('customer.subscription.deleted', 'sub_1'))
    expect(res.status).toBe(200)
    const s = await t.state(a)
    expect(s.plan).toBe('free')
    expect(s.plan_choice_required_at).toBeTruthy()
  })

  it('a trial agent whose first payment never went through keeps the trial', async () => {
    const a = await t.agent('trial')
    makeSub('sub_1', { customer: 'cus_1', agent: a, status: 'incomplete_expired' })
    await post(subEvent('customer.subscription.updated', 'sub_1'))
    expect(await profile(a)).toMatchObject({ plan: 'trial', subscription_status: 'incomplete_expired' })
  })
})

describe('reliability', () => {
  it('a duplicate event is processed once', async () => {
    const a = await t.agent('free')
    makeSub('sub_1', { customer: 'cus_1', agent: a })
    const e = checkoutCompleted(a, 'cus_1', 'sub_1')
    await post(e)
    const res = await post(e)
    expect(await res.json()).toMatchObject({ duplicate: true })
    expect(stripe.subscriptions.retrieve).toHaveBeenCalledTimes(1)
  })

  it('out of order: a stale "active" event after cancellation does not revive the plan', async () => {
    const a = await t.agent('free')
    makeSub('sub_1', { customer: 'cus_1', agent: a })
    const created = subEvent('customer.subscription.created', 'sub_1')   // payload says active
    await post(checkoutCompleted(a, 'cus_1', 'sub_1'))
    expect((await profile(a)).plan).toBe('starter')
    subs.get('sub_1').status = 'canceled'                                  // ...but it is canceled now
    await post(subEvent('customer.subscription.deleted', 'sub_1'))
    expect((await profile(a)).plan).toBe('free')
    await post(created)                                                   // arrives last
    expect(await profile(a)).toMatchObject({ plan: 'free', subscription_status: 'canceled' })
  })

  it('out of order: a stale past_due payload after recovery leaves the agent active', async () => {
    const a = await t.agent('starter'); await linkStripe(a, 'cus_1', 'sub_1')
    makeSub('sub_1', { customer: 'cus_1' })
    await post(subEvent('customer.subscription.updated', 'sub_1', { status: 'past_due' }))
    expect(await profile(a)).toMatchObject({ plan: 'starter', subscription_status: 'active' })
  })

  it('an old subscription ending never downgrades the agent off their current one', async () => {
    const a = await t.agent('pro'); await linkStripe(a, 'cus_1', 'sub_new')
    makeSub('sub_new', { customer: 'cus_1', price: P.pro })
    makeSub('sub_old', { customer: 'cus_1', status: 'canceled' })
    const res = await post(subEvent('customer.subscription.deleted', 'sub_old'))
    expect(await res.json()).toMatchObject({ skipped: 'not_current_subscription' })
    expect(await profile(a)).toMatchObject({ plan: 'pro', stripe_subscription_id: 'sub_new' })
  })

  it('a failed profile write returns 500, leaves the event unprocessed, and the retry applies it', async () => {
    const a = await t.agent('free')
    makeSub('sub_1', { customer: 'cus_1', agent: a })
    const e = checkoutCompleted(a, 'cus_1', 'sub_1')
    pg.failNext('profiles', 'update')
    const res = await post(e)
    expect(res.status).toBe(500)
    expect((await profile(a)).plan).toBe('free')
    expect((await ledger(e.id)).processed_at).toBeNull()

    const retry = await post(e)
    expect(retry.status).toBe(200)
    expect((await profile(a)).plan).toBe('starter')
    expect((await ledger(e.id)).processed_at).toBeTruthy()
  })

  it('a Stripe outage returns 500 (Stripe retries) and writes nothing', async () => {
    const a = await t.agent('free')
    makeSub('sub_1', { customer: 'cus_1', agent: a })
    stripeDown = true
    const e = checkoutCompleted(a, 'cus_1', 'sub_1')
    expect((await post(e)).status).toBe(500)
    expect((await ledger(e.id)).processed_at).toBeNull()
  })

  it('a failed ledger claim returns 500 and acts on nothing', async () => {
    const a = await t.agent('free')
    makeSub('sub_1', { customer: 'cus_1', agent: a })
    pg.failNext('stripe_webhook_events', 'insert')
    expect((await post(checkoutCompleted(a, 'cus_1', 'sub_1'))).status).toBe(500)
    expect((await profile(a)).plan).toBe('free')
  })

  it('events from the other mode are ignored', async () => {
    const a = await t.agent('free')
    makeSub('sub_1', { customer: 'cus_1', agent: a })
    const res = await post(evt('checkout.session.completed', checkoutCompleted(a, 'cus_1', 'sub_1').data.object, { livemode: true }))
    expect(await res.json()).toMatchObject({ ignored: 'livemode_mismatch' })
    expect((await profile(a)).plan).toBe('free')
    expect(await t.all(`select * from public.stripe_webhook_events`)).toHaveLength(0)
  })

  it('a bad signature is rejected', async () => {
    expect((await post(evt('customer.subscription.updated', {}), 'forged')).status).toBe(400)
  })
})

describe('guards', () => {
  it.each(['founding', 'alpha'])('%s: plan never changes; only the Stripe ids are stored', async plan => {
    const a = await t.agent(plan)
    makeSub('sub_1', { customer: 'cus_1', agent: a, price: P.pro })
    await post(checkoutCompleted(a, 'cus_1', 'sub_1'))
    expect(await profile(a)).toMatchObject({
      plan, stripe_customer_id: 'cus_1', stripe_subscription_id: 'sub_1', subscription_status: null, price_id: null,
    })
    subs.get('sub_1').status = 'canceled'
    await post(subEvent('customer.subscription.deleted', 'sub_1'))
    expect((await profile(a)).plan).toBe(plan)
    expect((await t.state(a)).plan_choice_required_at).toBeNull()
  })

  it('an unknown price id changes nothing', async () => {
    const a = await t.agent('starter'); await linkStripe(a, 'cus_1', 'sub_1')
    const before = await profile(a)
    makeSub('sub_1', { customer: 'cus_1', price: P.unknown })
    const res = await post(subEvent('customer.subscription.updated', 'sub_1'))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ acted: false, skipped: 'unknown_price' })
    expect(await profile(a)).toEqual(before)
    // And not for a cancellation either — it may be some other product.
    subs.get('sub_1').status = 'canceled'
    await post(subEvent('customer.subscription.deleted', 'sub_1'))
    expect((await profile(a)).plan).toBe('starter')
  })

  it('BILLING_AUTOMATION_ENABLED off: event logged, profile untouched, Stripe never called', async () => {
    process.env.BILLING_AUTOMATION_ENABLED = ''
    const a = await t.agent('free')
    makeSub('sub_1', { customer: 'cus_1', agent: a })
    const e = checkoutCompleted(a, 'cus_1', 'sub_1')
    const res = await post(e)
    expect(await res.json()).toMatchObject({ observed: true, acted: false })
    expect((await profile(a)).plan).toBe('free')
    expect(stripe.subscriptions.retrieve).not.toHaveBeenCalled()
    expect((await ledger(e.id))).toMatchObject({ automation_enabled: false, acted: false })
    expect((await ledger(e.id)).processed_at).toBeTruthy()
  })
})

describe('checkout', () => {
  const go = (tier: 'starter' | 'pro' = 'starter') =>
    checkout(new Request('http://test/api/stripe/checkout', { method: 'POST', body: JSON.stringify(checkoutBody(tier)) }))

  it('a new subscriber gets a Checkout session tagged with their id on the subscription too', async () => {
    const a = await t.agent('trial'); currentUser = { id: a, email: 'a@example.test' }
    const res = await go()
    expect(await res.json()).toEqual({ url: 'https://checkout.stripe.test/session' })
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(expect.objectContaining({
      line_items: [{ price: P.starter, quantity: 1 }], client_reference_id: a,
      subscription_data: { metadata: { agent_id: a } },
    }))
  })

  it.each(['active', 'trialing', 'past_due', 'unpaid', 'incomplete'])('refused with an existing %s subscription', async status => {
    const a = await t.agent('starter'); currentUser = { id: a, email: 'a@example.test' }
    await linkStripe(a, 'cus_1', 'sub_1'); makeSub('sub_1', { customer: 'cus_1', status })
    expect((await go('pro')).status).toBe(409)
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled()
  })

  it('refused even when the profile has not caught up (subscription found on the customer)', async () => {
    const a = await t.agent('free'); currentUser = { id: a, email: 'a@example.test' }
    await linkStripe(a, 'cus_1', null); makeSub('sub_x', { customer: 'cus_1' })
    expect((await go()).status).toBe(409)
  })

  it.each(['canceled', 'incomplete_expired'])('allowed again after a %s subscription, reusing the customer', async status => {
    const a = await t.agent('free'); currentUser = { id: a, email: 'a@example.test' }
    await linkStripe(a, 'cus_1', 'sub_1'); makeSub('sub_1', { customer: 'cus_1', status })
    expect((await go()).status).toBe(200)
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(expect.objectContaining({ customer: 'cus_1' }))
  })

  it('fails closed if Stripe cannot be checked', async () => {
    const a = await t.agent('free'); currentUser = { id: a, email: 'a@example.test' }
    await linkStripe(a, 'cus_1', 'sub_1'); stripeDown = true
    expect((await go()).status).toBe(502)
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled()
  })
})

describe('kill switches unchanged', () => {
  it.each([
    ['PAID_PLANS_ENABLED', 503], ['STRIPE_CHARGES_ENABLED', 503],
  ])('checkout and change-plan are off without %s', async (name, code) => {
    process.env[name] = ''
    const a = await t.agent('free'); currentUser = { id: a, email: 'a@example.test' }
    expect((await checkout(new Request('http://t/x', { method: 'POST', body: '{"tier":"starter","interval":"month"}' }))).status).toBe(code)
    expect((await changePlan(new Request('http://t/x', { method: 'POST', body: '{"tier":"pro"}' }))).status).toBe(code)
  })

  it('change-plan is off without BILLING_AUTOMATION_ENABLED (it modifies a subscription)', async () => {
    process.env.BILLING_AUTOMATION_ENABLED = 'TRUE'
    expect((await changePlan(new Request('http://t/x', { method: 'POST', body: '{"tier":"pro"}' }))).status).toBe(503)
    expect(stripe.subscriptions.update).not.toHaveBeenCalled()
  })

  it('annual checkout stays off without ANNUAL_BILLING_ENABLED', async () => {
    const a = await t.agent('free'); currentUser = { id: a, email: 'a@example.test' }
    expect((await checkout(new Request('http://t/x', { method: 'POST', body: '{"tier":"starter","interval":"year"}' }))).status).toBe(403)
  })

  it('portal is off without STRIPE_CHARGES_ENABLED', async () => {
    process.env.STRIPE_CHARGES_ENABLED = ''
    const a = await t.agent('starter'); currentUser = { id: a, email: 'a@example.test' }
    expect((await portal(new Request('http://t/x', { method: 'POST' }))).status).toBe(403)
  })
})

describe('portal', () => {
  const open = () => portal(new Request('http://test/api/stripe/portal', { method: 'POST' }))

  it('no Stripe customer → friendly 400, Stripe never called', async () => {
    const a = await t.agent('starter'); currentUser = { id: a, email: 'a@example.test' }
    const res = await open()
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/no billing account/i)
    expect(stripe.billingPortal.sessions.create).not.toHaveBeenCalled()
  })

  it('a Stripe error → friendly 502, not a crash', async () => {
    const a = await t.agent('starter'); currentUser = { id: a, email: 'a@example.test' }
    await linkStripe(a, 'cus_1', 'sub_1')
    stripe.billingPortal.sessions.create.mockRejectedValueOnce(new Error('No configuration provided'))
    const res = await open()
    expect(res.status).toBe(502)
    expect((await res.json()).error).toMatch(/couldn't open the billing portal/)
  })

  it('with a customer → portal url', async () => {
    const a = await t.agent('starter'); currentUser = { id: a, email: 'a@example.test' }
    await linkStripe(a, 'cus_1', 'sub_1')
    expect(await (await open()).json()).toEqual({ url: 'https://billing.stripe.test/portal' })
  })
})

describe('billing page wiring (source; visual check is manual)', () => {
  const s = src('app/dashboard/billing/BillingPageClient.tsx')
  it('Manage Subscription renders only when a Stripe customer exists', () => {
    expect(s).toContain('{paidPlansEnabled && hasBillingAccount && (')
    expect(s).not.toContain('{paidPlansEnabled && hasPaidPlan && (')
  })
  it('an open subscription switches tier via change-plan; otherwise checkout', () => {
    expect(s).toContain("hasOpenSubscription ? () => handleChangePlan(selectedTier) : () => handleCheckout(selectedTier)")
    expect(s).toContain("'/api/stripe/change-plan', {")
  })
  it('errors are shown inline, not via alert()', () => {
    expect(s).not.toMatch(/\balert\(/)
    expect(s).toContain('role="alert"')
  })
  it('the webhook declares the Node runtime', () => {
    expect(src('app/api/stripe/webhook/route.ts')).toContain("export const runtime = 'nodejs'")
  })
})

describe('migration 068', () => {
  it('only adds a nullable column: existing ledger rows and counts are unchanged', async () => {
    const fresh = await makePlanDb()
    await fresh.db.exec(src('supabase/migrations/038_entitlements_and_billing_scaffold.sql'))
    await fresh.db.query(`insert into public.stripe_webhook_events (event_id, type, livemode, automation_enabled, acted, payload_summary)
      values ('evt_a', 'invoice.paid', false, false, false, '{"x":1}'), ('evt_b', 'customer.subscription.updated', true, false, false, null)`)
    const before = await fresh.all(`select * from public.stripe_webhook_events order by event_id`)
    await fresh.db.exec(src('supabase/migrations/068_stripe_webhook_processed_at.sql'))
    const after = await fresh.all(`select * from public.stripe_webhook_events order by event_id`)
    expect(after).toHaveLength(2)
    expect(after.map(({ processed_at, ...rest }: any) => rest)).toEqual(before)
    expect(after.every((r: any) => r.processed_at === null)).toBe(true)
    expect(src('supabase/migrations/068_stripe_webhook_processed_at.sql')).not.toMatch(/^\s*(update|delete|insert)\b/im)
  })
})


// ═════════════════════════════════════════════════════════════════════════════
// Batch 2 — California auto-renewal consent
// ═════════════════════════════════════════════════════════════════════════════

const checkoutReq = (body: unknown, headers: Record<string, string> = {}) =>
  checkout(new Request('http://test/api/stripe/checkout', { method: 'POST', headers, body: JSON.stringify(body) }))
const changeReq = (body: unknown, headers: Record<string, string> = {}) =>
  changePlan(new Request('http://test/api/stripe/change-plan', { method: 'POST', headers, body: JSON.stringify(body) }))
const consentRows = () => t.all(`select * from public.auto_renewal_consents order by created_at, id`)

/** An agent already subscribed through the webhook, signed in, with an email on file. */
async function subscribedAgent(priceId: string, email = 'agent@example.test') {
  const a = await t.agent('free')
  pg.users.set(a, email)
  makeSub('sub_1', { customer: 'cus_1', agent: a, price: priceId })
  await post(checkoutCompleted(a, 'cus_1', 'sub_1'))
  currentUser = { id: a, email }
  sendEmail.mockClear()
  return a
}
async function newcomer() {
  const a = await t.agent('trial'); currentUser = { id: a, email: 'new@example.test' }
  return a
}

describe('consent wording (what the page shows and the server stores)', () => {
  it.each([
    ['starter', 'new', '$39'], ['pro', 'new', '$69'], ['pro', 'upgrade', '$69'], ['starter', 'downgrade', '$39'],
  ] as const)('%s / %s: plan, price, monthly auto-renewal, monthly charge, online cancellation, period-end, no-refund line', (tier, kind, price) => {
    const text = autoRenewalConsentText(tier, kind)
    expect(text).toContain(tier === 'starter' ? 'Starter' : 'Pro')
    expect(text).toContain(`${price} per month`)
    expect(text).toContain('renews automatically every month until you cancel')
    expect(text).toMatch(new RegExp(`card is charged .*${price.replace('$', '\\$')} each month on your renewal date`))
    expect(text).toContain('Cancel anytime online: use Manage Subscription')
    expect(text).toContain('end of the period you have already paid for')
    expect(text).toContain('non-refundable, including for partial months, except as required by law')
    expect(text).toContain(`[x] I agree that my ${tier === 'starter' ? 'Starter' : 'Pro'} subscription will renew automatically each month at ${price} until I cancel, and I authorize theQRealtor to charge my card each month. I can cancel anytime in Manage Subscription.`)
  })
  it('an upgrade says the prorated difference is charged today; a downgrade says the unused time is credited', () => {
    expect(autoRenewalConsentText('pro', 'upgrade')).toContain('Today your card is charged the prorated difference')
    expect(autoRenewalConsentText('starter', 'downgrade')).toContain('credited to your next invoice')
  })
})

describe('consent is required — server side', () => {
  it('checkout refuses without a true consent flag: 400, no Stripe call, no row', async () => {
    await newcomer()
    const { consent, ...noFlag } = checkoutBody()
    for (const body of [noFlag, { ...checkoutBody(), consent: false }, { ...checkoutBody(), consent: 'true' }, { ...checkoutBody(), consent: 1 }]) {
      const res = await checkoutReq(body)
      expect(res.status).toBe(400)
      expect(await res.json()).toMatchObject({ code: 'consent_required' })
    }
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled()
    expect(stripe.prices.retrieve).not.toHaveBeenCalled()
    expect(await consentRows()).toHaveLength(0)
  })

  it('change-plan refuses without a true consent flag: 400, subscription untouched, no row', async () => {
    const a = await subscribedAgent(P.starter)
    const { consent, ...noFlag } = { tier: 'pro', ...consentFor('pro') }
    for (const body of [noFlag, { tier: 'pro', ...consentFor('pro'), consent: false }, { tier: 'pro', ...consentFor('pro'), consent: 'yes' }]) {
      const res = await changeReq(body)
      expect(res.status).toBe(400)
      expect(await res.json()).toMatchObject({ code: 'consent_required' })
    }
    expect(stripe.subscriptions.update).not.toHaveBeenCalled()
    expect(await consentRows()).toHaveLength(0)
    expect((await profile(a)).plan).toBe('starter')
  })

  it.each([
    ['an old version', { consentVersion: 'ca-arl-2020-01-v0' }],
    ['no version', { consentVersion: undefined }],
    ['no text', { consentText: undefined }],
    ['another plan\'s text', { consentText: autoRenewalConsentText('pro', 'new') }],
    ['an upgrade text for a new subscription', { consentText: autoRenewalConsentText('starter', 'upgrade') }],
    ['text with the price changed', { consentText: autoRenewalConsentText('starter', 'new').replaceAll('$39', '$29') }],
  ])('checkout refuses %s with 409 consent_outdated', async (_name, override) => {
    await newcomer()
    const res = await checkoutReq({ ...checkoutBody(), ...override })
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ code: 'consent_outdated' })
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled()
    expect(await consentRows()).toHaveLength(0)
  })

  it('change-plan refuses text for the wrong kind of change (downgrade text on an upgrade)', async () => {
    await subscribedAgent(P.starter)
    const res = await changeReq({ tier: 'pro', ...consentPayload('pro', 'downgrade') })
    expect(res.status).toBe(409)
    expect(stripe.subscriptions.update).not.toHaveBeenCalled()
    expect(await consentRows()).toHaveLength(0)
  })

  it('annual stays off even if ANNUAL_BILLING_ENABLED is set: no annual consent exists', async () => {
    process.env.ANNUAL_BILLING_ENABLED = 'true'
    await newcomer()
    expect((await checkoutReq({ ...checkoutBody(), interval: 'year' })).status).toBe(403)
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled()

    // A yearly subscription cannot be changed either.
    await subscribedAgent(P.starterYear)
    expect((await changeReq({ tier: 'pro', ...consentFor('pro') })).status).toBe(403)
    expect(stripe.subscriptions.update).not.toHaveBeenCalled()
    expect(await consentRows()).toHaveLength(0)
  })
})

describe('consent proof is stored before Stripe is touched', () => {
  it('checkout: one row with the exact text, plan, price, interval, version, ip, user agent — present when Stripe is called', async () => {
    const a = await newcomer()
    let rowsAtStripeCall: any[] = []
    stripe.checkout.sessions.create.mockImplementationOnce(async () => {
      rowsAtStripeCall = await consentRows()
      return { url: 'https://checkout.stripe.test/session' }
    })
    const res = await checkoutReq(checkoutBody('starter'), { 'x-forwarded-for': '203.0.113.7, 10.0.0.1', 'user-agent': 'TestBrowser/1.0' })
    expect(res.status).toBe(200)
    expect(rowsAtStripeCall).toHaveLength(1)
    expect(rowsAtStripeCall[0]).toMatchObject({
      user_id: a, plan: 'starter', price_cents: 3900, interval: 'month',
      consent_text: autoRenewalConsentText('starter', 'new'),
      consent_version: AUTO_RENEWAL_CONSENT_VERSION,
      ip: '203.0.113.7', user_agent: 'TestBrowser/1.0',
    })
    expect(rowsAtStripeCall[0].created_at).toBeTruthy()
    expect(await consentRows()).toHaveLength(1)
  })

  it('change-plan upgrade: row (Pro, 6900, upgrade text) exists when the subscription is changed', async () => {
    const a = await subscribedAgent(P.starter)
    let rowsAtStripeCall: any[] = []
    stripe.subscriptions.update.mockImplementationOnce(async (id: string, params: any) => {
      rowsAtStripeCall = await consentRows()
      subs.get(id).items.data[0].price = price(params.items[0].price)
      return structuredClone(subs.get(id))
    })
    expect((await changeReq({ tier: 'pro', ...consentFor('pro') }, { 'x-real-ip': '198.51.100.9' })).status).toBe(200)
    expect(rowsAtStripeCall).toHaveLength(1)
    expect(rowsAtStripeCall[0]).toMatchObject({
      user_id: a, plan: 'pro', price_cents: 6900, interval: 'month', ip: '198.51.100.9',
      consent_text: autoRenewalConsentText('pro', 'upgrade'), consent_version: AUTO_RENEWAL_CONSENT_VERSION,
    })
  })

  it('change-plan downgrade stores the downgrade text', async () => {
    await subscribedAgent(P.pro)
    expect((await changeReq({ tier: 'starter', ...consentFor('starter') })).status).toBe(200)
    expect((await consentRows())[0]).toMatchObject({ plan: 'starter', price_cents: 3900, consent_text: autoRenewalConsentText('starter', 'downgrade') })
  })

  it('an insert failure refuses checkout: 500, no session, nothing charged', async () => {
    await newcomer()
    pg.failNext('auto_renewal_consents', 'insert')
    const res = await checkoutReq(checkoutBody())
    expect(res.status).toBe(500)
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled()
    expect(await consentRows()).toHaveLength(0)
  })

  it('an insert failure refuses change-plan: 500, subscription not changed, plan stays', async () => {
    const a = await subscribedAgent(P.starter)
    pg.failNext('auto_renewal_consents', 'insert')
    const res = await changeReq({ tier: 'pro', ...consentFor('pro') })
    expect(res.status).toBe(500)
    expect(stripe.subscriptions.update).not.toHaveBeenCalled()
    expect((await profile(a)).plan).toBe('starter')
  })

  it('a refused request (existing subscription) leaves no consent row behind', async () => {
    await subscribedAgent(P.starter)
    expect((await checkoutReq(checkoutBody('pro'))).status).toBe(409)
    expect(await consentRows()).toHaveLength(0)
  })

  it('the amount disclosed must be the amount Stripe charges: a mismatched live price refuses, no row', async () => {
    await newcomer()
    priceCatalog.set(P.pro, { ...priceCatalog.get(P.pro), unit_amount: 7900 }) // the old $79 price still behind the env var
    const res = await checkoutReq(checkoutBody('pro'))
    expect(res.status).toBe(500)
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled()
    expect(await consentRows()).toHaveLength(0)
  })

  it.each([
    ['wrong currency', { currency: 'eur' }],
    ['archived price', { active: false }],
    ['billed yearly', { recurring: { interval: 'year', interval_count: 1 } }],
    ['billed every 3 months', { recurring: { interval: 'month', interval_count: 3 } }],
  ])('a live price that is %s refuses too', async (_n, patch) => {
    await newcomer()
    priceCatalog.set(P.starter, { ...priceCatalog.get(P.starter), ...patch })
    expect((await checkoutReq(checkoutBody('starter'))).status).toBe(500)
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled()
  })

  it('change-plan with a mismatched live price refuses before anything changes', async () => {
    const a = await subscribedAgent(P.starter)
    priceCatalog.set(P.pro, { ...priceCatalog.get(P.pro), unit_amount: 7900 })
    expect((await changeReq({ tier: 'pro', ...consentFor('pro') })).status).toBe(500)
    expect(stripe.subscriptions.update).not.toHaveBeenCalled()
    expect(await consentRows()).toHaveLength(0)
    expect((await profile(a)).plan).toBe('starter')
  })
})

// ── Confirmation email ───────────────────────────────────────────────────────
const nextChargeText = new Date(PERIOD_END * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })

describe('confirmation email', () => {
  async function agent(plan = 'free') {
    const a = await t.agent(plan); pg.users.set(a, 'agent@example.test'); return a
  }

  it('new subscription: exactly one email with plan, price, monthly auto-renewal, next charge date, online cancellation and support', async () => {
    const a = await agent()
    makeSub('sub_1', { customer: 'cus_1', agent: a, price: P.starter })
    const e = checkoutCompleted(a, 'cus_1', 'sub_1')
    expect((await post(e)).status).toBe(200)

    expect(sendEmail).toHaveBeenCalledTimes(1)
    const [msg, opts] = sendEmail.mock.calls[0]
    expect(msg).toMatchObject({ to: 'agent@example.test', replyTo: 'hello@theqrealtor.com', subject: 'Your theQRealtor Starter subscription is confirmed' })
    for (const needle of [
      'Starter', '$39 per month', 'renews automatically every month until you cancel',
      'charged $39 each month on your renewal date', `Next charge: $39 on ${nextChargeText}`,
      'https://theqrealtor.com/dashboard/billing', 'Manage Subscription', 'end of the period you have already paid for',
      'non-refundable', 'hello@theqrealtor.com',
    ]) expect(msg.text).toContain(needle)
    expect(msg.html).toContain('https://theqrealtor.com/dashboard/billing')
    expect(opts).toEqual({ idempotencyKey: 'sub-confirm:sub_1:' + P.starter + ':free' })

    // A redelivery, and the subscription events that follow, send nothing more.
    await post(e)
    await post(subEvent('customer.subscription.created', 'sub_1'))
    await post(subEvent('customer.subscription.updated', 'sub_1'))
    expect(sendEmail).toHaveBeenCalledTimes(1)
  })

  it('upgrade through change-plan: one email for Pro, and the webhook that follows adds none', async () => {
    await subscribedAgent(P.starter)
    expect((await changeReq({ tier: 'pro', ...consentFor('pro') })).status).toBe(200)
    expect(sendEmail).toHaveBeenCalledTimes(1)
    const [msg] = sendEmail.mock.calls[0]
    expect(msg.subject).toBe('Your theQRealtor plan is now Pro')
    expect(msg.text).toContain('Plan: Pro — $69 per month')
    expect(msg.text).toContain(`Next charge: $69 on ${nextChargeText}`)

    await post(subEvent('customer.subscription.updated', 'sub_1'))
    expect(sendEmail).toHaveBeenCalledTimes(1)
  })

  it('an upgrade seen only by the webhook (e.g. made in Stripe) sends one email', async () => {
    await subscribedAgent(P.starter)
    subs.get('sub_1').items.data[0].price = price(P.pro)
    const e = subEvent('customer.subscription.updated', 'sub_1')
    await post(e); await post(e)
    expect(sendEmail).toHaveBeenCalledTimes(1)
    expect(sendEmail.mock.calls[0][0].subject).toContain('Pro')
  })

  it('a downgrade to Starter is a plan change to a paid plan: one email', async () => {
    await subscribedAgent(P.pro)
    subs.get('sub_1').items.data[0].price = price(P.starter)
    await post(subEvent('customer.subscription.updated', 'sub_1'))
    expect(sendEmail).toHaveBeenCalledTimes(1)
    expect(sendEmail.mock.calls[0][0].subject).toContain('Starter')
  })

  it('no email for founding or alpha, even when a Stripe subscription appears', async () => {
    for (const plan of ['founding', 'alpha']) {
      const a = await agent(plan)
      makeSub(`sub_${plan}`, { customer: `cus_${plan}`, agent: a, price: P.pro })
      await post(checkoutCompleted(a, `cus_${plan}`, `sub_${plan}`))
      await post(subEvent('customer.subscription.updated', `sub_${plan}`))
    }
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('no email for past_due, cancellation, deletion, or a subscription set to cancel', async () => {
    const a = await agent('pro'); await linkStripe(a, 'cus_1', 'sub_1')
    makeSub('sub_1', { customer: 'cus_1', price: P.pro, status: 'past_due' })
    await post(subEvent('customer.subscription.updated', 'sub_1'))
    subs.get('sub_1').status = 'active'; subs.get('sub_1').cancel_at_period_end = true
    subs.get('sub_1').items.data[0].price = price(P.starter)
    await post(subEvent('customer.subscription.updated', 'sub_1'))
    subs.get('sub_1').status = 'canceled'
    await post(subEvent('customer.subscription.deleted', 'sub_1'))
    expect(sendEmail).not.toHaveBeenCalled()
  })

  describe('best-effort: a failed email never fails the webhook or the plan change', () => {
    const cases: [string, () => void][] = [
      ['Resend throws', () => sendEmail.mockRejectedValue(new Error('resend down'))],
      ['Resend returns an error', () => sendEmail.mockResolvedValue({ data: null, error: { message: 'rate limited' } })],
      ['the recipient lookup fails', () => { pg.failUserLookup.on = true }],
      ['RESEND_API_KEY is missing', () => { process.env.RESEND_API_KEY = '' }],
    ]
    it.each(cases)('webhook: %s → still 200, plan set, event processed', async (_name, breakIt) => {
      const a = await agent()
      makeSub('sub_1', { customer: 'cus_1', agent: a })
      const e = checkoutCompleted(a, 'cus_1', 'sub_1')
      breakIt()
      const res = await post(e)
      expect(res.status).toBe(200)
      expect((await profile(a)).plan).toBe('starter')
      expect((await ledger(e.id)).processed_at).toBeTruthy()
    })

    it('change-plan: Resend throws → still 200 and the plan is Pro', async () => {
      const a = await subscribedAgent(P.starter)
      sendEmail.mockRejectedValue(new Error('resend down'))
      expect((await changeReq({ tier: 'pro', ...consentFor('pro') })).status).toBe(200)
      expect((await profile(a)).plan).toBe('pro')
    })
  })
})

// ── Migration 069 ────────────────────────────────────────────────────────────
describe('migration 069 — auto_renewal_consents', () => {
  const sql069 = src('supabase/migrations/069_auto_renewal_consents.sql')
  const insert = (over: Record<string, unknown> = {}) => {
    const r = { user_id: t.uuid(), plan: 'starter', price_cents: 3900, interval: 'month', consent_text: 'text', consent_version: 'v1', ...over }
    return t.db.query(
      `insert into public.auto_renewal_consents (user_id, plan, price_cents, interval, consent_text, consent_version, created_at)
       values ($1,$2,$3,$4,$5,$6, coalesce($7::timestamptz, now())) returning id`,
      [r.user_id, r.plan, r.price_cents, r.interval, r.consent_text, r.consent_version, (r as any).created_at ?? null])
  }

  it('is service-role only: agents (and anon) can neither read nor write', async () => {
    await insert()
    for (const role of ['authenticated', 'anon']) {
      await t.db.exec(`set role ${role}`)
      await expect(t.db.query(`select * from public.auto_renewal_consents`)).rejects.toThrow(/permission denied/)
      await expect(t.db.query(`insert into public.auto_renewal_consents (user_id, plan, price_cents, interval, consent_text, consent_version) values (gen_random_uuid(),'pro',6900,'month','x','v')`)).rejects.toThrow(/permission denied/)
      await t.db.exec(`reset role`)
    }
    // Supabase's service_role bypasses RLS; the in-memory role needs the same attribute.
    await t.db.exec(`alter role service_role bypassrls`)
    await t.db.exec(`set role service_role`)
    expect((await t.db.query(`select * from public.auto_renewal_consents`)).rows).toHaveLength(1)
    await expect(t.db.query(`update public.auto_renewal_consents set plan = 'pro'`)).rejects.toThrow(/permission denied/)
    await expect(t.db.query(`delete from public.auto_renewal_consents`)).rejects.toThrow(/permission denied/)
    await t.db.exec(`reset role`)
    const rls = await t.one(`select relrowsecurity from pg_class where oid = 'public.auto_renewal_consents'::regclass`)
    expect(rls.relrowsecurity).toBe(true)
  })

  it('is append-only; rows younger than 3 years can never be deleted, older ones can', async () => {
    await insert()
    await expect(t.db.query(`update public.auto_renewal_consents set consent_text = 'edited'`)).rejects.toThrow(/append-only/)
    await expect(t.db.query(`delete from public.auto_renewal_consents`)).rejects.toThrow(/at least 3 years/)
    await expect(t.db.query(`truncate public.auto_renewal_consents`)).rejects.toThrow(/append-only/)
    await insert({ created_at: new Date(Date.now() - 2.9 * 365 * 86400_000).toISOString() })
    await expect(t.db.query(`delete from public.auto_renewal_consents`)).rejects.toThrow(/at least 3 years/)
    await insert({ created_at: new Date(Date.now() - 3.1 * 365 * 86400_000).toISOString() })
    await t.db.query(`delete from public.auto_renewal_consents where created_at < now() - interval '3 years'`)
    expect((await t.db.query(`select 1 from public.auto_renewal_consents`)).rows).toHaveLength(2)
  })

  it('only allows paid plans, a positive price, monthly, and non-empty text', async () => {
    await expect(insert({ plan: 'free' })).rejects.toThrow()
    await expect(insert({ price_cents: 0 })).rejects.toThrow()
    await expect(insert({ interval: 'year' })).rejects.toThrow()
    await expect(insert({ consent_text: '' })).rejects.toThrow()
    await expect(insert({ consent_version: '' })).rejects.toThrow()
  })

  it('has no foreign key to auth.users (proof must outlive the account) and documents the 3-year keep', () => {
    expect(sql069).not.toMatch(/references\s+auth\.users/i)
    expect(sql069).toMatch(/AT LEAST 3 YEARS/)
  })

  it('the retention cron (064) never touches it', () => {
    const retention = src('supabase/migrations/064_retention_cleanup.sql')
    expect(retention).not.toContain('auto_renewal_consents')
    // …and every delete the cron issues names its table explicitly.
    const deletes = [...retention.matchAll(/delete from ([\w.]+)/gi)].map(m => m[1])
    expect(deletes.every(d => ['public.scan_events', 'public.sms_consent_events', 'cron.job_run_details', 'public.retention_runs'].includes(d))).toBe(true)
  })
})

// ── The trial never charges ─────────────────────────────────────────────────
describe('the 45-day trial never collects a card or converts to paid', () => {
  const walk = (dir: string): string[] =>
    readdirSync(new URL(`../${dir}`, import.meta.url), { withFileTypes: true }).flatMap(e =>
      e.isDirectory() ? walk(`${dir}/${e.name}`) : /\.(ts|tsx)$/.test(e.name) ? [`${dir}/${e.name}`] : [])
  const files = ['app', 'lib', 'components'].flatMap(walk)

  it('nothing sets trial or card-collection parameters on Stripe', () => {
    const offenders = files.filter(f => /trial_period_days|trial_settings|payment_method_collection|setup_intent|SetupIntent/.test(src(f)))
    expect(offenders).toEqual([])
  })

  it('only the Stripe routes and lib/stripe*.ts talk to Stripe — signup, trial and cron code never do', () => {
    const touches = files.filter(f => /from 'stripe'|lib\/stripe'|\.\/stripe'|getStripe/.test(src(f))
      && !f.startsWith('app/api/stripe/') && !/^lib\/stripe(Sync)?\.ts$/.test(f)
      && !/^lib\/(autoRenewalConsent|billingEmail)\.ts$/.test(f))
    expect(touches).toEqual([])
  })

  it('the only writers of a paid plan are the Stripe sync and manual edits: no code path moves a trial to starter/pro', () => {
    const writers = files.filter(f => /\.update\(\{[^}]*\bplan\b/.test(src(f)) || /plan:\s*['"](starter|pro)['"]\s*[,}]/.test(src(f)))
    expect(writers.filter(f => !f.startsWith('app/api/stripe/') && f !== 'lib/stripeSync.ts')).toEqual([])
  })

  it('checkout starts a plain paid subscription with no trial period', async () => {
    await newcomer()
    expect((await checkoutReq(checkoutBody())).status).toBe(200)
    const params = (stripe.checkout.sessions.create.mock.calls[0] as unknown as [Record<string, any>])[0]
    expect(params.mode).toBe('subscription')
    for (const k of ['trial_period_days', 'trial_settings', 'payment_method_collection']) {
      expect(params).not.toHaveProperty(k)
      expect(params.subscription_data ?? {}).not.toHaveProperty(k)
    }
  })

  it('a trial agent stays on trial: nothing in the webhook moves a trial to paid without a real, paid subscription', async () => {
    const a = await t.agent('trial')
    // Stripe events for an unpaid, never-completed attempt don't convert the trial.
    makeSub('sub_1', { customer: 'cus_1', agent: a, status: 'incomplete' })
    await post(subEvent('customer.subscription.created', 'sub_1'))
    expect((await profile(a)).plan).toBe('trial')
  })
})

// ── Billing page ─────────────────────────────────────────────────────────────
describe('billing page: disclosure and consent (source; click-through is a manual check)', () => {
  const page = src('app/dashboard/billing/BillingPageClient.tsx')
  const panel = page.slice(page.indexOf('data-testid="auto-renewal-panel"'), page.indexOf('data-testid="auto-renewal-purchase"') + 600)

  it('the consent box starts unchecked and is the only checkbox (separate from any Terms/Privacy box)', () => {
    expect(page).toContain('const [agreed, setAgreed] = useState(false)')
    expect(page).toContain('checked={agreed}')
    expect(page.match(/type="checkbox"/g)).toHaveLength(1)
  })

  it('the purchase button is disabled until the box is ticked, and only the panel button can buy', () => {
    expect(page).toContain('disabled={!agreed || checkingOut}')
    // The plan cards only SELECT a plan; they never call checkout or change-plan.
    expect(page).toContain('onClick={() => { setSelectedTier(tierKey); setAgreed(false); setBillingError(null) }}')
    expect(page.match(/handleCheckout\(/g)).toHaveLength(1)    // only the panel's call (the definition is an arrow const)
    expect(page.match(/handleChangePlan\(/g)).toHaveLength(1)
  })

  it('order on the page: disclosure, then checkbox, then the button', () => {
    const d = page.indexOf('data-testid="auto-renewal-disclosure"')
    const c = page.indexOf('data-testid="auto-renewal-consent"')
    const b = page.indexOf('data-testid="auto-renewal-purchase"')
    expect(d).toBeGreaterThan(0)
    expect(c).toBeGreaterThan(d)
    expect(b).toBeGreaterThan(c)
  })

  it('the disclosure is plain full-size text from lib/autoRenewal — no fine print, no link, no tooltip', () => {
    expect(page).toContain('autoRenewalDisclosure(selectedTier, kind)')
    expect(page).toContain('autoRenewalCheckboxLabel(selectedTier)')
    expect(panel).not.toMatch(/fontSize:\s*(9|10|11|12)\b/)
    expect(panel).not.toMatch(/<a\s|<Link|title=|<details|<summary|display:\s*'none'/)
  })

  it('both purchase calls send the consent payload; Manage Subscription stays visible with a Stripe customer', () => {
    expect(page).toContain("...consentPayload(tier, 'new')")
    expect(page).toContain('...consentPayload(tier, changeKind(subscription?.tier ?? null, tier))')
    expect(page).toContain('Manage Subscription →')
    expect(page).toContain('{paidPlansEnabled && hasBillingAccount && (')
  })
})
