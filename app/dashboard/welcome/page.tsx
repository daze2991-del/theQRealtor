'use client'

import { useEffect } from 'react'
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

const NEXT_STEPS = [
  { icon: '📍', title: 'Place it on the sign',   desc: 'Print and mount your QR code where buyers can scan it.' },
  { icon: '🔗', title: 'Share the link',         desc: 'Drop it in listing sites, emails, and social posts too.' },
  { icon: '📊', title: 'Watch leads roll in',    desc: 'Track every scan and contact in your dashboard.' },
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
        .wl-card:hover { border-color: ${C.purple}66; transform: translateY(-2px); }
        @media (max-width: 560px) { .wl-steps { grid-template-columns: 1fr !important; } }
      `}</style>

      <div style={{ width: '100%', maxWidth: 560, textAlign: 'center' }}>

        {/* Gradient success checkmark */}
        <div style={{
          width: 88, height: 88, borderRadius: '50%', margin: '0 auto 26px',
          background: `linear-gradient(135deg, ${C.purpleL}, ${C.purple})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: `0 0 0 8px ${C.purple}1A, 0 16px 50px ${C.purple}55`,
          animation: 'popIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}>
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>

        {/* Headline */}
        <h1 style={{ fontSize: 32, fontWeight: 800, color: C.text, margin: '0 0 12px', letterSpacing: '-0.02em', animation: 'fadeUp 0.4s ease 0.05s both' }}>
          You&apos;re live! 🎉
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
            {NEXT_STEPS.map(({ icon, title, desc }) => (
              <div key={title} className="wl-card" style={{
                background: C.card, border: `1px solid ${C.border}`,
                borderRadius: 14, padding: '18px 16px',
              }}>
                <div style={{ fontSize: 28, marginBottom: 10, lineHeight: 1 }}>{icon}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 6 }}>{title}</div>
                <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.5 }}>{desc}</div>
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
              boxShadow: `0 4px 20px ${C.purple}50`,
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
