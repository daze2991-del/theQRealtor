// Legal text updates (docs/legal-text-updates.md → live pages). No database
// changes. Privacy/Terms/SMS-consent are plain server components, rendered
// for real with renderToStaticMarkup; the client pages ('use client', data
// fetched in useEffect) are checked via source text, matching how the rest
// of this suite verifies those files.

import { describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'fs'

const create = vi.fn()
vi.mock('twilio', () => ({ default: vi.fn(() => ({ messages: { create } })) }))

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

const { default: PrivacyPage } = await import('../app/privacy/page')
const { default: TermsPage } = await import('../app/terms/page')
const { default: SmsConsentPage } = await import('../app/sms-consent/page')
const { default: SmsAgentConsentText } = await import('../components/SmsAgentConsentText')
const { msg } = await import('../lib/twilio')

// React's static-markup renderer HTML-escapes text content too (', ", etc.),
// not just attributes — decode before doing plain-English substring checks.
const deEntity = (s: string) => s
  .replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&#x2F;/g, '/').replace(/&amp;/g, '&')

const privacyHtml = deEntity(renderToStaticMarkup(createElement(PrivacyPage)))
const termsHtml = deEntity(renderToStaticMarkup(createElement(TermsPage)))
const smsConsentHtml = deEntity(renderToStaticMarkup(createElement(SmsConsentPage)))

// ── Privacy Policy ────────────────────────────────────────────────────────────
describe('Privacy Policy: full replacement', () => {
  it('drops the retired wording the task flagged', () => {
    expect(privacyHtml.toLowerCase()).not.toContain('self-reported')
    expect(privacyHtml.toLowerCase()).not.toContain('browser type')
    expect(privacyHtml.toLowerCase()).not.toContain('approximate location')
  })

  it('"Last updated" is today', () => {
    expect(privacyHtml).toContain('Last updated: October 7, 2026')
  })

  it('section 9 uses the shortened override, not the doc\'s longer sentence', () => {
    expect(privacyHtml).toContain('When we update this policy, we change the date at the top.')
    expect(privacyHtml).not.toContain('we notify agents of significant changes')
  })

  it('sections 1–5 each carry an anchor id, and section 1 is #notice-at-collection', () => {
    for (const id of ['notice-at-collection', 'interest-scores', 'who-sees-it', 'text-messages', 'retention']) {
      expect(privacyHtml).toContain(`id="${id}"`)
    }
    // #notice-at-collection lands on the "Information we collect" section
    const idx = privacyHtml.indexOf('id="notice-at-collection"')
    expect(privacyHtml.slice(idx, idx + 400)).toContain('Information we collect')
  })

  it('carries the new buyer-facing and retention content from the doc', () => {
    expect(privacyHtml).toContain('Hot, Warm or Cold interest tier')
    expect(privacyHtml).toContain('photos viewed, time on the page')
    expect(privacyHtml).toContain('24 months, then deleted')
    expect(privacyHtml).toContain('5 years')
    expect(privacyHtml).toContain('No other agent')
    expect(privacyHtml).toContain('Google Maps')
  })

  it('keeps the existing page chrome: nav, header style, footer links', () => {
    expect(privacyHtml).toContain('Get started free')
    expect(privacyHtml).toContain('Back to home')
    expect(privacyHtml).toContain('Terms of Service')
    // The old policy's retired framing is gone
    expect(privacyHtml).not.toContain('lead capture platform')
  })
})

// ── Terms: only the specified pieces change ──────────────────────────────────
describe('Terms of Service: scoped replacement', () => {
  it('"Last updated" is today', () => {
    expect(termsHtml).toContain('Last updated: October 7, 2026')
  })

  it('§5 drops the retired line and gets the new buyer-confirmation wording', () => {
    expect(termsHtml).not.toContain('does not initiate SMS contact')
    expect(termsHtml).toContain('theQRealtor sends that buyer one text confirming the request')
    expect(termsHtml).toContain('theQRealtor sends buyers no other texts and no marketing')
  })

  it('About + §1 bullets + §4 paragraphs 2–3 carry the new text', () => {
    expect(termsHtml).toContain('shows agents how interested each buyer is')
    expect(termsHtml).toContain("See each buyer's interest tier and activity")
    expect(termsHtml).toContain('Receive text alerts when a buyer requests a showing or asks a question')
    expect(termsHtml).toContain('when a buyer requests a showing or asks a question about one of your listings')
    expect(termsHtml).toContain('varies with buyer activity. No messages are sent when there is no new request.')
  })

  it('§3 (Subscription and Billing) is byte-for-byte untouched', () => {
    expect(termsHtml).toContain(
      'theqrealtor offers free and paid subscription plans. Paid subscriptions are billed in advance on a monthly or annual basis through Stripe. All fees are non-refundable except as required by law or as explicitly stated in a refund policy.')
    expect(termsHtml).toContain("We reserve the right to change pricing with 30 days' notice to active subscribers.")
    expect(termsHtml).toContain('Beta Agent participants receive free full platform access during the beta testing period.')
  })

  it('§4 paragraphs NOT listed for replacement are untouched', () => {
    expect(termsHtml).toContain('Program name:')
    expect(termsHtml).toContain('theqrealtor SMS Lead Alerts')
    expect(termsHtml).toContain('Msg')
    expect(termsHtml).toContain('data rates may apply')
    expect(termsHtml).toContain('To opt out:')
    expect(termsHtml).toContain('For help:')
    expect(termsHtml).toContain('SMS Consent page')
  })

  it('every other section (2, 6–14) is untouched', () => {
    expect(termsHtml).toContain('You must be at least 18 years old to create an account.')
    expect(termsHtml).toContain('Telephone Consumer Protection Act (TCPA)')
    expect(termsHtml).toContain('THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE"')
    expect(termsHtml).toContain('State of California')
  })
})

// ── SMS consent page ↔ Settings: one shared paragraph ────────────────────────
describe('SMS consent page and Settings render the identical consent paragraph', () => {
  it('both files use the same shared component — can never drift apart', () => {
    expect(src('app/sms-consent/page.tsx')).toContain('<SmsAgentConsentText color={L.purple} />')
    expect(src('app/dashboard/settings/page.tsx')).toContain('<SmsAgentConsentText color={C.purpleL} />')
    // the settings page no longer has its own hand-written copy of the paragraph
    expect(src('app/dashboard/settings/page.tsx')).not.toContain('By enabling SMS alerts, you consent')
  })

  it('the shared component renders the exact wording, matching the doc', () => {
    const html = deEntity(renderToStaticMarkup(createElement(SmsAgentConsentText, { color: '#000' })))
    expect(html.replace(/<[^>]+>/g, '')).toBe(
      'By enabling SMS alerts, you consent to receive automated lead notification text messages ' +
      'from theqrealtor at the number provided. Message frequency varies. Msg & Data rates ' +
      'may apply. Reply STOP to unsubscribe at any time or HELP for help. View our Privacy Policy and Terms.')
  })

  it('the SMS consent page renders it inside the consent-language box', () => {
    expect(smsConsentHtml).toContain('By enabling SMS alerts, you consent to receive automated lead notification')
  })
})

describe('SMS consent page: other required changes', () => {
  it('the example message is generated from the real showingAlert template', () => {
    const expected = msg.showingAlert('John Buyer', '123 Main St', 'example-lead-id', '(555) 010-1234', null, 'Phone Call')
    expect(smsConsentHtml).toContain(expected)
    expect(expected).toContain('New showing request: John Buyer wants to see 123 Main St')
    expect(expected).toContain('Call: (555) 010-1234')
    expect(expected).toContain('Reply STOP to opt out.')
    // the retired hand-written example is gone
    expect(smsConsentHtml).not.toContain('Mike Davis')
    expect(smsConsentHtml).not.toContain('mike@email.com')
  })

  it('adds the showing/question line under "How Opt-In Works"', () => {
    expect(smsConsentHtml).toContain('Agents receive alerts only when a buyer requests a showing or asks a question.')
  })

  it('opt-out closing line is reworded', () => {
    expect(smsConsentHtml).toContain('No further alert texts are sent after you opt out.')
    expect(smsConsentHtml).not.toContain('SMS messages will immediately cease upon opt-out')
  })

  it('screenshot captions (2026-10-07: toggle caption updated for the redacted screenshots)', () => {
    for (const caption of ['Settings page — phone number field', 'SMS Lead Alerts toggle (off by default; shown turned on)', 'Confirmation state after opt-in enabled']) {
      expect(smsConsentHtml).toContain(caption)
    }
    expect(smsConsentHtml).not.toContain('SMS Lead Alerts toggle (default: off)')
    expect(smsConsentHtml).toContain('/images/sms-consent/settings-phone-field.png')
    expect(smsConsentHtml).toContain('/images/sms-consent/toggle-on.png')
    expect(smsConsentHtml).toContain('/images/sms-consent/full-settings.png')
  })
})

// ── Buyer pages ───────────────────────────────────────────────────────────────
describe('Buyer pages show the privacy notice on load, including paused', () => {
  it.each(['app/p/[propertyId]/page.tsx', 'app/open-house/[propertyId]/page.tsx'])('%s: notice is unconditional, not inside the paused/CTA branch', (file) => {
    const s = src(file)
    const notice = s.indexOf('This page records your visit')
    expect(notice).toBeGreaterThan(-1)
    expect(s.slice(notice, notice + 600)).toContain('Privacy notice')
    expect(s.slice(notice, notice + 600)).toContain('/privacy#notice-at-collection')
    // it renders before any branch that depends on `accepting` or `isArchived`,
    // so it's visible however those resolve — including the paused state
    const acceptingBranch = s.search(/accepting === false|isArchived \? \(/)
    expect(acceptingBranch).toBeGreaterThan(notice)
  })

  it('/p: submit-button footer is now the two lines from the doc', () => {
    const s = src('app/p/[propertyId]/page.tsx')
    expect(s).toContain('Your information goes only to the listing agent for this property — never to other agents or advertisers.')
    expect(s).toContain('By submitting, you authorize the listing agent to contact you using the methods you selected. Standard message and data rates may apply.')
    // the old third line is gone
    expect(s).not.toContain('not shared with other agents')
    // SMS consent checkbox and the "not currently represented" line are untouched
    expect(s).toContain('not currently represented by a buyer')
  })
})

// ── Agent signup ──────────────────────────────────────────────────────────────
describe('Signup shows the Terms/Privacy line, signup mode only, no checkbox', () => {
  it('exact text, both links, gated on signup mode', () => {
    const s = src('app/auth/page.tsx')
    const idx = s.indexOf('By creating an account, you agree to our')
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(s.lastIndexOf('mode === "signup"', idx), idx + 400)
    expect(block).toContain('mode === "signup"')
    expect(block).toContain('href="/terms"')
    expect(block).toContain('Terms of Service')
    expect(block).toContain('href="/privacy"')
    expect(block).toContain('Privacy Policy')
    expect(block).not.toMatch(/type=["']checkbox["']/)
  })

  it('placed after the submit button, before the sign-in/sign-up toggle', () => {
    const s = src('app/auth/page.tsx')
    const submit = s.indexOf('Verify your phone to continue')
    const notice = s.indexOf('By creating an account, you agree to our')
    const toggle = s.indexOf('Need an account?')
    expect(submit).toBeLessThan(notice)
    expect(notice).toBeLessThan(toggle)
  })
})
