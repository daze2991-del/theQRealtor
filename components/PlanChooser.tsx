'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { X } from 'lucide-react'
import { PRICING_CATALOG, FREE_TIER_DISPLAY } from '../lib/pricing'
import { TRIAL_ENDED_INTRO } from '../lib/planLock'
import FreeSelection from './FreeSelection'

// End-of-trial chooser: full-screen modal shown by DashboardLayout on every
// dashboard page while a trial is expired and no plan has been chosen.
// Nothing is pre-selected. Starter and Pro go to the existing billing page,
// which applies PAID_PLANS_ENABLED (no checkout changes here). Free opens the
// "choose what stays active" step.

const C = {
  bg: '#0F0F13', card: '#1A1A24', border: '#252533', purple: '#7C3AED', purpleL: '#8B5CF6',
  text: '#FFFFFF', sub: '#C4C4D4', muted: '#6B7280',
} as const

// One-line explanation per card. Prices and limits come from lib/pricing.ts,
// which reads lib/plans.ts.
const CARDS = [
  { key: 'free',    name: FREE_TIER_DISPLAY.displayName,         price: FREE_TIER_DISPLAY.displayPrice,         limits: FREE_TIER_DISPLAY.copy,         blurb: 'Keep one listing and a few signs taking buyer requests.' },
  { key: 'starter', name: PRICING_CATALOG.starter.displayName,   price: PRICING_CATALOG.starter.displayPrice,   limits: PRICING_CATALOG.starter.copy,   blurb: 'The same working allowance you had during your trial.' },
  { key: 'pro',     name: PRICING_CATALOG.pro.displayName,       price: PRICING_CATALOG.pro.displayPrice,       limits: PRICING_CATALOG.pro.copy,       blurb: 'For agents running many listings at once.' },
] as const

export default function PlanChooser({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<'plans' | 'free'>('plans')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="plan-chooser-title"
      style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(8,8,12,0.92)', overflowY: 'auto', fontFamily: 'sans-serif' }}>
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '48px 20px', position: 'relative' }}>
        <button onClick={onClose} aria-label="Close"
          style={{ position: 'absolute', top: 16, right: 16, background: 'transparent', border: 'none', color: C.sub, cursor: 'pointer', display: 'flex', padding: 6 }}>
          <X size={22} />
        </button>

        {step === 'plans' ? (
          <>
            <h2 id="plan-chooser-title" style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: '0 0 8px' }}>Choose your plan</h2>
            <p style={{ fontSize: 14, color: C.sub, margin: '0 0 24px', lineHeight: 1.6 }}>{TRIAL_ENDED_INTRO}</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
              {CARDS.map(card => (
                <div key={card.key} data-plan-card={card.key}
                  style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>{card.name}</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: C.purpleL }}>{card.price}</div>
                  <div style={{ fontSize: 13, color: C.text, lineHeight: 1.5 }}>{card.limits}</div>
                  <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.5, flex: 1 }}>{card.blurb}</div>
                  {card.key === 'free' ? (
                    <button type="button" onClick={() => setStep('free')}
                      style={{ marginTop: 8, background: 'transparent', border: `1px solid ${C.purple}`, color: C.purpleL, borderRadius: 9, padding: '10px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                      Choose Free
                    </button>
                  ) : (
                    <Link href="/dashboard/billing"
                      style={{ marginTop: 8, textAlign: 'center', background: 'transparent', border: `1px solid ${C.purple}`, color: C.purpleL, borderRadius: 9, padding: '10px', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
                      Choose {card.name}
                    </Link>
                  )}
                </div>
              ))}
            </div>
          </>
        ) : (
          <div style={{ maxWidth: 560, margin: '0 auto', background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 24 }}>
            <FreeSelection mode="choose" onBack={() => setStep('plans')} onDone={() => window.location.reload()} />
          </div>
        )}
      </div>
    </div>
  )
}
