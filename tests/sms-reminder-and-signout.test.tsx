// Step 5: the thank-you page reminder line, and the shared dashboard sign-out.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import SmsConfirmationReminder, { SMS_CONFIRMATION_REMINDER } from '../app/p/[propertyId]/SmsConfirmationReminder'

const signOut = vi.fn(async () => ({ error: null }))
vi.mock('../lib/supabase-browser', () => ({ createBrowserSupabase: () => ({ auth: { signOut } }) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

const { signOutAndRedirect, SIGN_OUT_REDIRECT } = await import('../components/useSignOut')

afterEach(() => { vi.restoreAllMocks() })

describe('SmsConfirmationReminder', () => {
  const EXACT = "You'll get a confirmation text shortly. Didn't get it? If you've ever replied STOP to us, text START to (620) 522-8398 to turn texts back on."

  it('has the exact wording', () => {
    expect(SMS_CONFIRMATION_REMINDER).toBe(EXACT)
  })

  it('renders the line when shown (consent + phone)', () => {
    const html = renderToStaticMarkup(createElement(SmsConfirmationReminder, { show: true }))
    expect(html).toContain('text START to (620) 522-8398 to turn texts back on.')
    expect(html.startsWith('<p')).toBe(true)
  })

  it('renders nothing when not shown', () => {
    expect(renderToStaticMarkup(createElement(SmsConfirmationReminder, { show: false }))).toBe('')
  })

  it('never makes a network call — the same line for everyone, no opt-out lookup', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    renderToStaticMarkup(createElement(SmsConfirmationReminder, { show: true }))
    renderToStaticMarkup(createElement(SmsConfirmationReminder, { show: false }))
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('shared sign-out', () => {
  it('signs out of Supabase, then redirects to the same place the sidebar always did ("/")', async () => {
    const calls: string[] = []
    signOut.mockImplementationOnce(async () => { calls.push('signOut'); return { error: null } })
    const router = { push: vi.fn((href: string) => { calls.push(`push:${href}`) }) }
    await signOutAndRedirect(router)
    expect(SIGN_OUT_REDIRECT).toBe('/')
    expect(calls).toEqual(['signOut', 'push:/'])
  })
})
