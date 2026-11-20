// Batch 3 follow-up: exact homepage copy, invite check before any SMS, Terms.
// Supabase and Twilio are faked — no SMS is sent, no live data touched.

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { makeFakeDb } from './helpers/fakeSupabase'

let db = makeFakeDb()
const smsStarted: string[] = []
let openSignup = false

vi.mock('server-only', () => ({}))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => db.client }))
vi.mock('../lib/twilio', () => ({
  startPhoneVerification: async (phone: string) => { smsStarted.push(phone); return { ok: true } },
}))
vi.mock('../lib/signup', () => ({ openSignupEnabled: () => openSignup, MAX_ENROLLED_AGENTS: 25 }))

const read = (p: string) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const Marketing = (await import('../app/(marketing)/page')).default
const { POST: sendCode } = await import('../app/api/auth/phone/send/route')
const { INVITE_ONLY_MESSAGE, INVITE_MAILTO } = await import('../lib/inviteCopy')
const { PRICING_CATALOG } = await import('../lib/pricing')
const { PLAN_CONFIG } = await import('../lib/plans')

const req = (body: unknown) => new Request('http://x/api/auth/phone/send', { method: 'POST', body: JSON.stringify(body) })
const PHONE = '(415) 555-2671'

// ── A. Homepage copy ─────────────────────────────────────────────────────────
describe('A. homepage exact copy', () => {
  const html = renderToStaticMarkup(createElement(Marketing))
  const text = html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ')

  it('badge, how-it-works step 3, feature text', () => {
    expect(text).toContain('Now inviting agents · Free plan available')
    expect(text).toContain('When a buyer requests a showing or asks a question, you get an instant alert (text on Starter and Pro, email on Free) and their details go straight to your dashboard.')
    expect(text).toContain('When a buyer submits an inquiry, you get an instant alert with their engagement history. You always know the context before you call.')
  })
  it('pricing subtitle is the original; the extra "now inviting" sentence is gone', () => {
    expect(text).toContain('Free for your first 45 days, then choose a plan.')
    expect(text).not.toContain('theQRealtor is now inviting agents')
  })
  it('Free card, with limits from lib/plans.ts', () => {
    expect(PLAN_CONFIG.free.maxActiveListings).toBe(1)
    expect(PLAN_CONFIG.free.maxActiveSigns).toBe(3)
    expect(text).toContain('Free $0 /mo')
    expect(text).toContain('1 active listing and 3 active signs. Buyer inquiries with full contact details, by email.')
    // Free card comes before Starter
    expect(text.indexOf('Buyer inquiries with full contact details')).toBeLessThan(text.indexOf(PRICING_CATALOG.starter.copy))
  })
  it('Starter and Pro extra lines; prices still from the catalog', () => {
    expect(text).toContain('Lead scoring, text alerts and Needs Your Attention.')
    expect(text).toContain('Everything in Starter.')
    expect(text).toContain(PRICING_CATALOG.starter.displayPrice.split('/')[0])
    expect(text).toContain(PRICING_CATALOG.pro.displayPrice.split('/')[0])
  })
  it('final call to action', () => {
    expect(text).toContain('Start with a 45-day free trial with 3 listings and up to 15 signs. No credit card required. Your inquiries, always yours.')
    expect(text).toContain('45-day free trial · 3 listings · Up to 15 signs · No card required')
  })
  it('every "Request an invite" opens the mailto; none go to the signup tab; Log in stays /auth', () => {
    const anchors = [...html.matchAll(/<a [^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/g)]
    const invites = anchors.filter(a => a[2].trim() === 'Request an invite')
    expect(invites).toHaveLength(6) // nav, hero, Free, Starter, Pro, final
    for (const a of invites) expect(a[1]).toBe(INVITE_MAILTO)
    expect(INVITE_MAILTO).toBe('mailto:hello@theqrealtor.com?subject=theQRealtor%20invite%20request')
    expect(html).not.toContain('tab=signup')
    expect(anchors.find(a => a[2].trim() === 'Log in')![1]).toBe('/auth')
    expect(text).not.toMatch(/beta|limited spots/i)
  })
  it('pricing grid stacks on phones (1 column) and goes 3-up only from lg; nothing fixed-width', () => {
    const src = read('app/(marketing)/page.tsx')
    const pricing = src.slice(src.indexOf('function Pricing()'), src.indexOf('function FinalCta()'))
    expect(pricing).toContain('grid grid-cols-1 lg:grid-cols-3')
    expect(pricing).not.toMatch(/\bw-\[\d+px\]|min-w-\[\d+px\]|\bw-\d{2,}\b/)
    expect(pricing).toContain('min-w-0')
  })
})

// ── B. Invite check before any SMS ───────────────────────────────────────────
describe('B. invite check precedes verification SMS (server-side)', () => {
  beforeEach(() => {
    db = makeFakeDb()
    smsStarted.length = 0
    openSignup = false
    db.tables.beta_allowlist = [
      { email: 'invited@example.com', approved: true },
      { email: 'pending@example.com', approved: false },
    ]
  })

  it('non-invited email: invite-only message, 403, and NO SMS', async () => {
    const res = await sendCode(req({ phone: PHONE, email: 'stranger@example.com' }))
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe(INVITE_ONLY_MESSAGE)
    expect(smsStarted).toHaveLength(0)
  })
  it('on the list but not approved → same refusal, no SMS', async () => {
    const res = await sendCode(req({ phone: PHONE, email: 'pending@example.com' }))
    expect(res.status).toBe(403)
    expect(smsStarted).toHaveLength(0)
  })
  it('called directly with no email / junk email → refused, no SMS', async () => {
    for (const email of [undefined, '', 42, 'not-an-email', null]) {
      const res = await sendCode(req({ phone: PHONE, email }))
      expect(res.status).toBe(403)
    }
    expect((await sendCode(new Request('http://x', { method: 'POST', body: 'garbage' }))).status).toBe(403)
    expect(smsStarted).toHaveLength(0)
  })
  it('refusal reveals nothing about the list (identical body for every non-invited case)', async () => {
    const bodies = await Promise.all(
      ['stranger@example.com', 'pending@example.com', ''].map(async email => JSON.stringify(await (await sendCode(req({ phone: PHONE, email }))).json()))
    )
    expect(new Set(bodies).size).toBe(1)
  })
  it('fails closed when the allowlist cannot be read', async () => {
    db.failReads.add('beta_allowlist')
    expect((await sendCode(req({ phone: PHONE, email: 'invited@example.com' }))).status).toBe(403)
    expect(smsStarted).toHaveLength(0)
  })
  it('invited email proceeds exactly as before (case/space-insensitive)', async () => {
    const res = await sendCode(req({ phone: PHONE, email: '  Invited@Example.com ' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(smsStarted).toHaveLength(1)
  })
  it('OPEN_SIGNUP_ENABLED (when someone turns it on) skips the list; unset keeps it invite-only', async () => {
    openSignup = true
    expect((await sendCode(req({ phone: PHONE, email: 'stranger@example.com' }))).status).toBe(200)
    openSignup = false
    smsStarted.length = 0
    expect((await sendCode(req({ phone: PHONE, email: 'stranger@example.com' }))).status).toBe(403)
    expect(smsStarted).toHaveLength(0)
  })
  it('the sign-up form passes the email and shows the invite-only screen on 403', () => {
    const s = read('app/auth/page.tsx')
    expect(s).toContain('JSON.stringify({ phone, email })')
    expect(s).toMatch(/res\.status === 403\) \{\s*\/\/[^\n]*\n\s*setInviteOnly\(true\)/)
  })

  // MUTATION CHECK — remove the server-side refusal from a real copy of the
  // route; the "non-invited gets no SMS" assertion must then FAIL.
  describe('mutation check', () => {
    const dir = 'app/api/auth/phone/__mutant'
    const src = read('app/api/auth/phone/send/route.ts')
    const gate = /  if \(!\(await isInvitedEmail\(email\)\)\) \{[^]*?\n  \}\n/
    afterAll(() => rmSync(new URL('../' + dir, import.meta.url), { recursive: true, force: true }))

    it('the real route contains the gate (so the mutation below is meaningful)', () => {
      expect(gate.test(src)).toBe(true)
    })
    it('without the gate, a non-invited email DOES trigger an SMS — the tests above would catch that', async () => {
      mkdirSync(new URL('../' + dir, import.meta.url), { recursive: true })
      writeFileSync(new URL('../' + dir + '/route.ts', import.meta.url), src.replace(gate, ''))
      const mutantPath = '../app/api/auth/phone/__mutant/route'
      const { POST: mutant } = await import(/* @vite-ignore */ mutantPath)
      const res = await mutant(req({ phone: PHONE, email: 'stranger@example.com' }))
      expect(res.status).toBe(200)
      expect(smsStarted).toHaveLength(1) // the leak the real route prevents
    })
  })
})

// ── C. Terms ─────────────────────────────────────────────────────────────────
describe('C. Terms / Privacy / SMS Consent beta wording', () => {
  it('no beta-period wording left in the three legal pages; Terms date is updated', () => {
    for (const f of ['terms', 'privacy', 'sms-consent']) expect(read(`app/${f}/page.tsx`)).not.toMatch(/beta/i)
    expect(read('app/terms/page.tsx')).toContain('Last updated: November 19, 2026')
  })
})
