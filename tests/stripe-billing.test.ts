// Batch 1 — Stripe billing core. Mocked Stripe (no network, no keys) and the
// real plan-locking migrations (059–063, 067) plus 038's webhook ledger and
// 068 in an in-memory Postgres, so every webhook write goes through
// trg_protect_profile_entitlements and the 067 downgrade trigger for real.

import { readFileSync } from 'fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makePlanDb } from './helpers/planDb'
import { makePgSupabase } from './helpers/pgSupabase'

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
  invoices: { retrieve: vi.fn(async (id: string) => structuredClone(invoices.get(id))) },
  checkout: { sessions: { create: vi.fn(async () => ({ url: 'https://checkout.stripe.test/session' })) } },
  billingPortal: { sessions: { create: vi.fn(async () => ({ url: 'https://billing.stripe.test/portal' })) } },
}
vi.mock('../lib/stripe', () => ({ getStripe: () => stripe }))

import { POST as webhook } from '../app/api/stripe/webhook/route'
import { POST as checkout } from '../app/api/stripe/checkout/route'
import { POST as changePlan } from '../app/api/stripe/change-plan/route'
import { POST as portal } from '../app/api/stripe/portal/route'
import { planForPriceId } from '../lib/pricing'

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
  pg = makePgSupabase(t.db)
  subs.clear(); invoices.clear(); stripeDown = false; upgradeCharge = 'ok'; currentUser = null
  vi.clearAllMocks()
  Object.assign(process.env, {
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
  const changeTo = (tier: unknown) =>
    changePlan(new Request('http://test/api/stripe/change-plan', { method: 'POST', body: JSON.stringify({ tier }) }))

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
    const res = await checkout(new Request('http://test/api/stripe/checkout', { method: 'POST', body: JSON.stringify({ tier: 'pro', interval: 'month' }) }))
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ code: 'existing_subscription' })
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled()
  })

  it('change-plan never accepts a raw price id, and only touches the session user\'s subscription', async () => {
    await starterAgent()
    expect((await changeTo(P.pro)).status).toBe(400)
    expect((await changePlan(new Request('http://test/x', { method: 'POST', body: JSON.stringify({ tier: 'pro', priceId: P.unknown }) }))).status).toBe(200)
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
  const go = (body: any = { tier: 'starter', interval: 'month' }) =>
    checkout(new Request('http://test/api/stripe/checkout', { method: 'POST', body: JSON.stringify(body) }))

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
    expect((await go({ tier: 'pro', interval: 'month' })).status).toBe(409)
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
    expect(s).toContain("hasOpenSubscription ? () => handleChangePlan(tierKey) : () => handleCheckout(tierKey)")
    expect(s).toContain("'/api/stripe/change-plan', { tier }")
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
