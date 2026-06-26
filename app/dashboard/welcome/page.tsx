'use client'

import { type ReactElement, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createBrowserSupabase } from '../../../lib/supabase-browser'

/* ─── tokens — match the dashboard / onboarding theme ────────────── */
const C = {
  bg:      '#0F0F13',
  card:    '#1A1A24',
  border:  '#252533',
  purple:  '#7C3AED',
  purpleL: '#8B5CF6',
  text:    '#FFFFFF',
  sub:     '#C4C4D4',
  muted:   '#6B7280',
} as const

/* ─── line icons matching sidebar stroke style ─────────────────── */
const iconProps = {
  width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none',
  stroke: C.purpleL, strokeWidth: '1.8',
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
}

function PinIcon()   { return <svg {...iconProps}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg> }
function LinkIcon()  { return <svg {...iconProps}><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg> }
function ChartIcon() { return <svg {...iconProps}><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="3" y1="20" x2="21" y2="20"/></svg> }

const NEXT_STEPS: Array<{ Icon: () => ReactElement; title: string; desc: string }> = [
  { Icon: PinIcon,   title: 'Place it on the sign',   desc: 'Print and mount your QR code where buyers can scan it.' },
  { Icon: LinkIcon,  title: 'Share the link',         desc: 'Drop it in listing sites, emails, and social posts too.' },
  { Icon: ChartIcon, title: 'Watch leads roll in',    desc: 'Track every scan and contact in your dashboard.' },
]

export default function WelcomePage() {
  const router = useRouter()

  useEffect(() => {
    const run = async () => {
      const supabase = createBrowserSupabase()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/auth'); return }
      // Mark the welcome screen as seen so it never shows again.
      await supabase.from('profiles').update({ has_seen_welcome: true }).eq('id', session.user.id)
    }
    run()
  }, [])

  return (
    <div style={{
      minHeight: '100vh', background: C.bg,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '40px 16px', fontFamily: 'sans-serif',
    }}>
      <style>{`
        @keyframes popIn  { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .wl-card { transition: border-color 0.15s, transform 0.15s; }
        .wl-card:hover { border-color: ${C.purple}55; transform: translateY(-2px); }
        @media (max-width: 560px) { .wl-steps { grid-template-columns: 1fr !important; } }
      `}</style>

      <div style={{ width: '100%', maxWidth: 560, textAlign: 'center' }}>

        {/* Frosted success checkmark */}
        <div style={{
          width: 88, height: 88, borderRadius: '50%', margin: '0 auto 26px',
          background: 'rgba(124, 58, 237, 0.18)',
          border: '1.5px solid rgba(139, 92, 246, 0.32)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 0 0 8px rgba(124, 58, 237, 0.07), 0 8px 28px rgba(124, 58, 237, 0.22)',
          animation: 'popIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={C.purpleL} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>

        {/* Headline */}
        <h1 style={{ fontSize: 32, fontWeight: 800, color: C.text, margin: '0 0 12px', letterSpacing: '-0.02em', animation: 'fadeUp 0.4s ease 0.05s both' }}>
          You&apos;re live!
        </h1>
        <p style={{ fontSize: 16, color: C.sub, margin: '0 auto 36px', lineHeight: 1.6, maxWidth: 460, animation: 'fadeUp 0.4s ease 0.1s both' }}>
          Your QR code is active. Every scan from your yard sign now lands in your lead inbox.
        </p>

        {/* What's next */}
        <div style={{ textAlign: 'left', animation: 'fadeUp 0.4s ease 0.15s both' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 14 }}>
            What&apos;s next
          </div>
          <div className="wl-steps" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 32 }}>
            {NEXT_STEPS.map(({ Icon, title, desc }) => (
              <div key={title} className="wl-card" style={{
                background: C.card, border: `0.5px solid ${C.border}`,
                borderRadius: 12, padding: '14px 14px',
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 8,
                  background: 'rgba(124, 58, 237, 0.13)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: 10, flexShrink: 0,
                }}>
                  <Icon />
                </div>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: C.text, marginBottom: 5 }}>{title}</div>
                <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>{desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Primary CTA + secondary link */}
        <div style={{ animation: 'fadeUp 0.4s ease 0.2s both' }}>
          <button
            onClick={() => router.push('/dashboard')}
            style={{
              width: '100%', padding: '15px',
              background: C.purple, color: '#fff', border: 'none',
              borderRadius: 12, fontSize: 15, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'sans-serif', letterSpacing: '-0.01em',
              boxShadow: `0 4px 12px rgba(124, 58, 237, 0.28)`,
            }}
          >
            Go to Dashboard →
          </button>
          <Link href="/dashboard/new-property" style={{
            display: 'inline-block', marginTop: 16,
            fontSize: 14, fontWeight: 600, color: C.purpleL, textDecoration: 'none',
          }}>
            Add another property
          </Link>
        </div>

      </div>
    </div>
  )
}
