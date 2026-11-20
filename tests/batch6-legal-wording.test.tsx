// Batch 6 — attorney wording updates (Oct 6 guidance). Pages are rendered for
// real; buyer pages ('use client') are checked via source text like the rest
// of the suite.
import { describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'fs'

vi.mock('twilio', () => ({ default: vi.fn(() => ({ messages: { create: vi.fn() } })) }))

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const deEntity = (s: string) => s
  .replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&#x2F;/g, '/').replace(/&amp;/g, '&')
const text = (html: string) => deEntity(html).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ')

const { default: PrivacyPage } = await import('../app/privacy/page')
const { default: TermsPage } = await import('../app/terms/page')
const { default: SmsConsentPage } = await import('../app/sms-consent/page')
const { msg } = await import('../lib/twilio')
const { SMS_CONSENT_TEXT } = await import('../lib/smsConsent')
const { REPLY_FREEFORM_OPT_OUT } = await import('../lib/sms/inboundReplies')

const terms = text(renderToStaticMarkup(createElement(TermsPage)))
const sms = text(renderToStaticMarkup(createElement(SmsConsentPage)))
const privacy = text(renderToStaticMarkup(createElement(PrivacyPage)))

describe('Terms', () => {
  it('has the required buyer SMS wording and no removed wording', () => {
    expect(terms).toContain("With a buyer's affirmative consent, theQRealtor sends one confirmation text when the buyer submits a request through a listing page. We do not send marketing texts to buyers.")
    expect(terms).not.toContain('does not initiate SMS contact')
    expect(terms).not.toContain('sends buyers no other texts')
    expect(terms).not.toContain('ticks the optional consent box')
    expect(terms).toContain('Last updated: November 19, 2026')
  })
})

describe('SMS Consent page', () => {
  it('shows the real buyer checkbox text, confirmation and opt-out reply from code', () => {
    expect(sms).toContain(SMS_CONSENT_TEXT)
    expect(sms).toContain(msg.buyerConfirmation('showing', '123 Main St', 'Jane Agent'))
    expect(sms).toContain(REPLY_FREEFORM_OPT_OUT)
    expect(sms).toContain(msg.showingAlert('John Buyer', '123 Main St', 'example-lead-id', '(555) 010-1234', null, 'Phone Call'))
    expect(sms).toContain('Last updated: November 19, 2026')
  })
  it('drops stale agent-only framing', () => {
    expect(sms).not.toContain('How real estate agents opt in to receive SMS lead alerts')
  })
})

describe('Privacy Policy buyer wording', () => {
  it('has the required statements', () => {
    expect(privacy).toContain('photos viewed, time on the page, and whether you request a showing or ask a question')
    expect(privacy).toContain('the name, phone number and/or email address you choose to submit')
    expect(privacy).toContain('Hot, Warm or Cold interest tier, a score and a point breakdown')
    expect(privacy).toContain('shown only to the listing agent, to help them prioritize follow-up')
    expect(privacy).toContain("The score never hides, deletes or blocks a buyer's request; the agent decides.")
    for (const v of ['Vercel (hosting)', 'Supabase (database)', 'Twilio (text messaging)', 'Resend (email)']) expect(privacy).toContain(v)
    expect(privacy).toContain('We do not sell or share personal information for cross-context behavioral advertising.')
    expect(privacy).toContain('24 months, then deleted')
    expect(privacy).toContain('5 years')
    expect(privacy).toContain('California rights.')
    expect(privacy).toContain('access to the personal information we hold about you, ask us to delete it, or ask us to correct it')
    expect(privacy).toContain('hello@theqrealtor.com')
    expect(privacy).toContain('Last updated: November 19, 2026')
  })
  it('contains no retired or untrue data wording', () => {
    const l = privacy.toLowerCase()
    for (const bad of ['self-reported', 'browser type', 'approximate location', 'analytics', 'device type', 'we do not share it for advertising']) expect(l).not.toContain(bad)
  })
})

describe('Buyer pages: collection notice', () => {
  it('/p renders the exact notice with link, unconditionally, before the form', () => {
    const s = src('app/p/[propertyId]/page.tsx')
    const i = s.indexOf('This page records visits, photos viewed and time on page to help the listing agent follow up.')
    expect(i).toBeGreaterThan(-1)
    expect(s.slice(i, i + 400)).toContain('href="/privacy#notice-at-collection"')
    expect(s.slice(i, i + 400)).toContain('Privacy notice')
    expect(i).toBeLessThan(s.indexOf('<form'))
    expect(s).not.toContain('This page records your visit')
  })

  it('/open-house shows the submission-only notice (it does not record visits), before the form', () => {
    const s = src('app/open-house/[propertyId]/page.tsx')
    const i = s.indexOf('Information you submit is shared with the listing agent.')
    expect(i).toBeGreaterThan(-1)
    expect(s.slice(i, i + 300)).toContain('href="/privacy#notice-at-collection"')
    expect(s.slice(i, i + 300)).toContain('Privacy notice')
    expect(i).toBeLessThan(s.indexOf('<form'))
    expect(s).not.toContain('records visits')
    expect(s).not.toContain('This page records')
  })
})

describe('Scoring legal comment', () => {
  it('is present in lib/leadScoringV2.ts', () => {
    expect(src('lib/leadScoringV2.ts')).toContain("Legal: the score must only inform the agent. Never use it to hide, delete, block or gate a buyer's request or showing access without new legal review.")
  })
})
