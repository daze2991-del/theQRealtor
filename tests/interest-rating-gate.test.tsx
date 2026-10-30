// Property "Interest" rating (High / Moderate / Low badge, score circle,
// heading, blurb) is a scoring feature: hidden entirely for Free, unchanged for
// paid. Also: the dashboard per-property showings count reads
// score_breakdown.requested_showing (kept for every plan by leads_scoped), not
// the motivation column that leads_scoped nulls for Free.
//
// The client pages need a DOM + data fetching to render, and this suite has no
// jsdom, so: the shared InterestBadge is rendered for real; each page surface
// is checked structurally (its render sits inside the plan gate).

import { readFileSync } from 'fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

const { default: InterestBadge } = await import('../components/InterestBadge')
const { requestedShowing } = await import('../lib/leadScoringV2')
const { PLAN_CONFIG } = await import('../lib/plans')

const html = (plan: string | null, leads = 6, scans = 0, hot = 0) =>
  renderToStaticMarkup(createElement(InterestBadge, { scans, leads, hot, plan }))

describe('InterestBadge (dashboard Your Properties + top property)', () => {
  it('Free renders nothing — no badge, no placeholder', () => {
    expect(html('free')).toBe('')
    expect(html('free', 0, 0, 3)).toBe('')
  })

  it('null / unknown plan (not loaded yet, typo) fails closed', () => {
    for (const p of [null, 'bogus', '']) expect(html(p)).toBe('')
  })

  it.each(Object.keys(PLAN_CONFIG).filter(p => p !== 'free'))('%s still renders the rating', plan => {
    expect(html(plan, 6)).toContain('High Interest')
    expect(html(plan, 1)).toContain('Moderate Interest')
    expect(html(plan, 0, 0, 0)).toContain('Low Interest')
    expect(html(plan, 0, 0, 1)).toContain('High Interest')
  })
})

describe('dashboard per-property showings count', () => {
  // Shape leads_scoped returns for a Free agent: motivation/tier nulled,
  // score_breakdown trimmed to the two request counts.
  const freeRow = { property_id: 'p1', motivation: null, tier: null, score_breakdown: { requested_showing: 15, requested_info: 0 } }
  const freeNoShowing = { property_id: 'p1', motivation: null, tier: null, score_breakdown: { requested_showing: 0, requested_info: 5 } }
  const paidHotNoShowing = { property_id: 'p1', motivation: 'hot', tier: 'hot', score_breakdown: { return_visits: { count: 2, points: 20 } } }

  it('counts a Free showing request even though motivation is null', () => {
    expect(requestedShowing(freeRow)).toBe(true)
    expect(requestedShowing(freeNoShowing)).toBe(false)
  })

  it('a paid lead that is hot without asking for a showing is not a showing', () => {
    expect(requestedShowing(paidHotNoShowing)).toBe(false)
  })

  it('dashboard page counts via requestedShowing, not motivation', () => {
    const s = src('app/dashboard/page.tsx')
    expect(s).toMatch(/if \(requestedShowing\(l\)\) hotByProp\[l\.property_id\]/)
    expect(s).not.toMatch(/l\.motivation === 'hot'\) hotByProp/)
  })
})

// Slice a source string from a marker to the next marker so each assertion is
// scoped to one surface.
const between = (s: string, from: string, to: string) => {
  const i = s.indexOf(from)
  const j = s.indexOf(to, i + from.length)
  expect(i).toBeGreaterThan(-1)
  expect(j).toBeGreaterThan(i)
  return s.slice(i, j)
}

describe('every other rating surface renders only behind the scoring gate', () => {
  it('dashboard: both badge uses go through InterestBadge with plan; no inline calcPropertyInterest', () => {
    const s = src('app/dashboard/page.tsx')
    const uses = s.match(/<InterestBadge [^>]*>/g) ?? []
    expect(uses).toHaveLength(2)
    for (const u of uses) expect(u).toContain('plan={plan}')
    expect(s).not.toContain('calcPropertyInterest')
  })

  it('lead detail Property card: pill is inside canSeeScoring(plan)', () => {
    const s = src('app/dashboard/leads/[leadId]/page.tsx')
    const gate = between(s, '{canSeeScoring(plan) && (\n                      <span', '{/* Stats row */}')
    expect(gate).toContain('health.badgeLabel')
    expect(s.match(/health\.badgeLabel/g)).toHaveLength(1)
  })

  it('property detail: header pill and the whole Listing Health card (score circle, heading, blurb) are inside scoringOn', () => {
    const s = src('app/dashboard/properties/[propertyId]/page.tsx')
    expect(s).toContain('const scoringOn    = canSeeScoring(owner?.plan ?? null)')
    const pill = between(s, '{scoringOn && (\n                <span', '{pausedReason')
    expect(pill).toContain('healthCfg.badgeLabel')
    const card = between(s, '{scoringOn && (\n            <SectionCard\n              title="Listing Health"', '{/* Property Image */}')
    for (const k of ['healthCfg.score', 'healthCfg.label', 'healthCfg.text']) expect(card).toContain(k)
    // nothing else outside the two gated blocks uses the config
    const rest = s.replace(pill, '').replace(card, '')
    expect(rest).not.toMatch(/healthCfg\.(badgeLabel|score|label|text)/)
  })

  it('seller report: both pills and the blurb are inside scoringEnabled (owner plan, from /api/report/[token])', () => {
    const s = src('app/report/[token]/page.tsx')
    const header = between(s, '{scoringEnabled && (\n            <span', '<button')
    expect(header).toContain('health.badgeLabel')
    const hero = between(s, '{scoringEnabled && (\n              <>', '{/* Right: report meta */}')
    expect(hero).toContain('health.badgeLabel')
    expect(hero).toContain('health.text')
    const rest = s.replace(header, '').replace(hero, '')
    expect(rest).not.toMatch(/health\.(badgeLabel|text|color)/)
  })

  it('report page gets scoringEnabled from the owner profile plan via canSeeScoring', () => {
    const s = src('app/api/report/[token]/route.ts')
    expect(s).toContain("select('plan').eq('id', ownerId)")
    expect(s).toContain('scoringEnabled = canSeeScoring(ownerPlanRow?.plan ?? null)')
  })

  it('plain counts (leads / scans / showings) still render ungated on the surfaces', () => {
    expect(src('app/dashboard/page.tsx')).toContain('>Showings</span>')
    expect(src('app/dashboard/leads/[leadId]/page.tsx')).toContain("{ label: 'Showings',   value: propStats.showings }")
  })
})
