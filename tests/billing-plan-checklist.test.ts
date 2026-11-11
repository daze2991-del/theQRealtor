// Billing page "what's included" list is driven by lib/plans.ts, so Free no
// longer shows checkmarks for scoring or SMS alerts it doesn't have.

import { readFileSync } from 'fs'
import { describe, expect, it } from 'vitest'
import { PLAN_CONFIG } from '../lib/plans'
import { NOT_INCLUDED_NOTE, planChecklist } from '../lib/planChecklist'

const SCORING = 'Buyer interest scoring (Hot/Warm/Cold)'
const SMS = 'SMS lead alerts'
const included = (plan: string | null | undefined) => planChecklist(plan).items.filter(i => i.included).map(i => i.label)
const find = (plan: string | null | undefined, label: string) => planChecklist(plan).items.find(i => i.label === label)

describe('Free checklist', () => {
  const c = planChecklist('free')

  it('heading is "Your Free plan includes"', () => {
    expect(c.heading).toBe('Your Free plan includes')
  })

  it('checks only what Free has, with limits read from lib/plans.ts', () => {
    expect(included('free')).toEqual([
      '1 active listing',
      '3 active signs',
      'Buyer lead capture with full contact info',
      'QR sign tracking',
      'Email lead alerts',
    ])
    expect(PLAN_CONFIG.free.maxActiveListings).toBe(1)
    expect(PLAN_CONFIG.free.maxActiveSigns).toBe(3)
  })

  it('scoring and SMS are shown with no checkmark and the "Not included" note', () => {
    for (const l of [SCORING, SMS]) {
      const item = find('free', l)!
      expect(item.included).toBe(false)
      expect(item.note).toBe(NOT_INCLUDED_NOTE)
    }
    expect(NOT_INCLUDED_NOTE).toBe('Not included — available on paid plans')
  })

  it('makes no claims about paid-only extras (seller reports, analytics, CSV, priority support)', () => {
    const labels = c.items.map(i => i.label).join('|')
    for (const w of ['Seller reports', 'Analytics', 'CSV', 'Priority support']) expect(labels).not.toContain(w)
  })
})

describe.each(['founding', 'alpha', 'trial', 'starter', 'pro'])('%s checklist (unchanged from today)', plan => {
  it('keeps the existing heading and full list, incl. scoring and SMS as checkmarks', () => {
    const c = planChecklist(plan)
    expect(c.heading).toBe('Your Beta Agent Plan')
    expect(included(plan)).toEqual([
      'All your active listings', 'Buyer lead capture', 'QR sign tracking', SCORING, SMS,
      'Seller reports', 'Analytics dashboard', 'CSV export', 'Priority support',
    ])
    expect(c.items.every(i => i.included)).toBe(true)
  })
})

describe('unknown plan values are Free', () => {
  it.each([null, undefined, '', 'bogus', 'FREE', 'Pro', 'beta'])('%j', plan => {
    expect(planChecklist(plan)).toEqual(planChecklist('free'))
  })
})

describe('copy rules', () => {
  it('no plan checklist ever says "unlimited"', () => {
    for (const plan of [...Object.keys(PLAN_CONFIG), 'bogus', null]) {
      expect(JSON.stringify(planChecklist(plan)).toLowerCase()).not.toContain('unlimited')
    }
  })
})

describe('BillingPageClient wiring', () => {
  const s = readFileSync(new URL('../app/dashboard/billing/BillingPageClient.tsx', import.meta.url), 'utf8')

  it('renders the heading and items from planChecklist, with a checkmark only for included items', () => {
    expect(s).toContain('const checklist = planChecklist(plan)')
    expect(s).toContain('{checklist.heading}')
    expect(s).toContain('checklist.items.map((item, i) => item.included ? (')
    expect(s).not.toContain("'Buyer interest scoring (Hot/Warm/Cold)'")
    expect(s).not.toContain("'SMS lead alerts'")
  })

  it('normalizes an unknown stored plan to free before any plan-dependent text', () => {
    expect(s).toContain("rawPlan && rawPlan in PLAN_CONFIG ? (rawPlan as PlanId) : 'free'")
  })
})
