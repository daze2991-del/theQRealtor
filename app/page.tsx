import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'

export const metadata: Metadata = {
  title: 'theQRealtor — Yard Sign Scans → Instant Buyer Leads',
  description: 'Turn every yard sign scan into a captured buyer lead. Instant SMS alerts, intent scoring, and seller reports — built for real estate agents.',
}

const C = {
  navy:    '#0F172A',
  navy2:   '#1E293B',
  navy3:   '#0D1829',
  blue:    '#2563EB',
  blueL:   '#3B82F6',
  blueXL:  '#60A5FA',
  blueBg:  '#172554',
  text:    '#F8FAFC',
  sub:     '#CBD5E1',
  muted:   '#64748B',
  border:  '#1E3A5F',
  hot:     '#EF4444',
  hotBg:   '#450A0A',
  green:   '#22C55E',
} as const

/* ─── SMS notification mockup ─────────────────────────────────── */
function PhoneMock() {
  return (
    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 340, width: '100%' }}>
      {/* Phone frame */}
      <div style={{
        background: '#111827',
        border: '6px solid #374151',
        borderRadius: 40,
        padding: '24px 16px 20px',
        boxShadow: '0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px #1F2937',
      }}>
        {/* Notch */}
        <div style={{ width: 90, height: 10, background: '#374151', borderRadius: 10, margin: '0 auto 18px' }} />
        {/* Status bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14, padding: '0 4px' }}>
          <span style={{ fontSize: 10, color: '#9CA3AF', fontWeight: 600 }}>9:41</span>
          <span style={{ fontSize: 10, color: '#9CA3AF' }}>●●● ▲ 🔋</span>
        </div>
        {/* Lock screen notification */}
        <div style={{
          background: 'rgba(255,255,255,0.08)',
          backdropFilter: 'blur(20px)',
          borderRadius: 16,
          padding: '12px 14px',
          marginBottom: 10,
          border: '1px solid rgba(255,255,255,0.1)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div style={{ width: 28, height: 28, background: C.hot, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>🔥</div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#fff', letterSpacing: '-0.01em' }}>theQRealtor</div>
              <div style={{ fontSize: 10, color: '#9CA3AF' }}>now</div>
            </div>
          </div>
          <div style={{ fontSize: 12, color: '#fff', fontWeight: 700, marginBottom: 3 }}>🔥 HOT BUYER ALERT</div>
          <div style={{ fontSize: 11, color: '#E2E8F0', lineHeight: 1.5 }}>
            Sarah M. requested a showing at 742 Evergreen Terrace. Phone: (555) 210-4821. Call immediately.
          </div>
        </div>
        {/* Second notification */}
        <div style={{
          background: 'rgba(255,255,255,0.05)',
          borderRadius: 14,
          padding: '10px 12px',
          border: '1px solid rgba(255,255,255,0.07)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <div style={{ width: 24, height: 24, background: C.blueL, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, flexShrink: 0 }}>📱</div>
            <div style={{ fontSize: 10, fontWeight: 600, color: '#CBD5E1' }}>theQRealtor</div>
          </div>
          <div style={{ fontSize: 11, color: '#CBD5E1', lineHeight: 1.5 }}>
            New lead: James K. scanned your sign at 742 Evergreen. Buyer intent: Actively searching.
          </div>
        </div>
      </div>

      {/* Floating dashboard card */}
      <div style={{
        background: C.navy2,
        border: `1px solid ${C.border}`,
        borderRadius: 16,
        padding: '16px 18px',
        boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>742 Evergreen · Today</div>
        <div style={{ display: 'flex', gap: 10 }}>
          {[
            { v: '12', label: 'Scans', color: C.blueXL, bg: `${C.blue}20` },
            { v: '4',  label: 'Leads', color: '#FCD34D', bg: '#3A2D0D' },
            { v: '2',  label: 'Hot 🔥', color: C.hot,   bg: C.hotBg },
          ].map(({ v, label, color, bg }) => (
            <div key={label} style={{ flex: 1, background: bg, borderRadius: 10, padding: '8px 6px', textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 900, color, lineHeight: 1 }}>{v}</div>
              <div style={{ fontSize: 9, color: C.muted, marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ─── feature card ────────────────────────────────────────────── */
function FeatureCard({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div style={{
      background: C.navy2, border: `1px solid ${C.border}`,
      borderRadius: 20, padding: '28px 26px',
      display: 'flex', flexDirection: 'column', gap: 14,
    }}>
      <div style={{ fontSize: 32 }}>{icon}</div>
      <div style={{ fontSize: 17, fontWeight: 800, color: C.text, letterSpacing: '-0.01em', lineHeight: 1.25 }}>{title}</div>
      <div style={{ fontSize: 14.5, color: C.sub, lineHeight: 1.7 }}>{body}</div>
    </div>
  )
}

/* ─── page ────────────────────────────────────────────────────── */
export default function LandingPage() {
  return (
    <div style={{ background: C.navy, minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', color: C.text, overflowX: 'hidden' }}>
      <style>{`
        * { box-sizing: border-box; }
        @media (max-width: 768px) {
          .hero-grid    { flex-direction: column !important; }
          .hero-visual  { display: none !important; }
          .steps-grid   { flex-direction: column !important; }
          .feat-grid    { flex-direction: column !important; }
          .proof-grid   { flex-wrap: wrap !important; }
          .nav-links    { display: none !important; }
          .hero-h1      { font-size: 36px !important; }
          .hero-btns    { flex-direction: column !important; }
          .faq-item     { padding: 18px 20px !important; }
          .price-card   { padding: 32px 24px !important; }
        }
        details summary { cursor: pointer; list-style: none; }
        details summary::-webkit-details-marker { display: none; }
        details[open] .faq-arrow { transform: rotate(180deg); }
        .faq-arrow { transition: transform 0.2s; display: inline-block; }
        a { transition: opacity 0.15s; }
        a:hover { opacity: 0.8; }
      `}</style>

      {/* ── NAVBAR ── */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'rgba(15,23,42,0.92)', backdropFilter: 'blur(16px)',
        borderBottom: `1px solid ${C.border}`,
        padding: '0 32px', height: 64,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        maxWidth: '100%',
      }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none', flexShrink: 0 }}>
          <Image src="/logo-icon.png" alt="theQRealtor" width={140} height={48} style={{ display: 'block' }} />
        </Link>

        <div className="nav-links" style={{ display: 'flex', gap: 32, alignItems: 'center' }}>
          <a href="#features" style={{ fontSize: 14, color: C.sub, textDecoration: 'none', fontWeight: 500 }}>Features</a>
          <a href="#pricing" style={{ fontSize: 14, color: C.sub, textDecoration: 'none', fontWeight: 500 }}>Pricing</a>
          <Link href="/auth" style={{ fontSize: 14, color: C.sub, textDecoration: 'none', fontWeight: 500 }}>Sign In</Link>
        </div>

        <Link href="/auth" style={{
          background: C.blue, color: '#fff',
          fontSize: 13, fontWeight: 700,
          padding: '9px 20px', borderRadius: 10,
          textDecoration: 'none', flexShrink: 0,
          letterSpacing: '-0.01em',
        }}>
          Start Free Trial
        </Link>
      </nav>

      {/* ── HERO ── */}
      <section style={{ maxWidth: 1140, margin: '0 auto', padding: '80px 32px 72px' }}>
        <div className="hero-grid" style={{ display: 'flex', alignItems: 'center', gap: 56, justifyContent: 'space-between' }}>
          {/* Left */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: `${C.blue}22`, border: `1px solid ${C.blue}40`,
              borderRadius: 100, padding: '5px 14px 5px 10px',
              marginBottom: 28,
            }}>
              <span style={{ fontSize: 14 }}>🏠</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.blueXL, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Scan · Capture · Convert
              </span>
            </div>

            <h1 className="hero-h1" style={{
              fontSize: 52, fontWeight: 900, color: C.text,
              margin: '0 0 22px', lineHeight: 1.1, letterSpacing: '-0.03em',
            }}>
              Every Buyer Who Stops At Your Listing —{' '}
              <span style={{
                background: `linear-gradient(135deg, ${C.blueXL}, ${C.blue})`,
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              }}>
                Captured.
              </span>
            </h1>

            <p style={{ fontSize: 18, color: C.sub, lineHeight: 1.7, margin: '0 0 36px', maxWidth: 520 }}>
              theQRealtor turns yard sign scans into instant lead alerts, buyer intent scores, and seller reports. No app for buyers. No paper sign-in sheets. Just results.
            </p>

            <div className="hero-btns" style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
              <Link href="/auth" style={{
                background: C.blue, color: '#fff',
                fontSize: 16, fontWeight: 800,
                padding: '14px 28px', borderRadius: 12,
                textDecoration: 'none', letterSpacing: '-0.01em',
                boxShadow: `0 4px 24px ${C.blue}60`,
              }}>
                Start Free Trial →
              </Link>
              <a href="#how-it-works" style={{
                background: 'transparent', color: C.sub,
                fontSize: 15, fontWeight: 600,
                padding: '14px 24px', borderRadius: 12,
                textDecoration: 'none', border: `1px solid ${C.border}`,
              }}>
                See How It Works
              </a>
            </div>

            <div style={{ marginTop: 24, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              {['✓ No credit card required', '✓ Setup in minutes', '✓ Cancel anytime'].map((item, i) => (
                <span key={i} style={{ fontSize: 13, color: C.muted }}>
                  <span style={{ color: C.blueXL, fontWeight: 700 }}>{item.slice(0, 1)}</span>{item.slice(1)}{i < 2 ? <span style={{ color: C.border, margin: '0 6px' }}>·</span> : null}
                </span>
              ))}
            </div>
          </div>

          {/* Right — phone visual */}
          <div className="hero-visual" style={{ display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
            <PhoneMock />
          </div>
        </div>
      </section>

      {/* ── SOCIAL PROOF BAR ── */}
      <section style={{ borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, background: C.navy2 }}>
        <div style={{ maxWidth: 1140, margin: '0 auto', padding: '24px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 20 }}>
          <span style={{ fontSize: 13, color: C.muted, fontWeight: 500 }}>
            Built for solo agents who own their leads
          </span>
          <div className="proof-grid" style={{ display: 'flex', gap: 40 }}>
            {[
              { stat: 'Minutes', label: 'Quick setup' },
              { stat: 'Instant', label: 'SMS alerts' },
              { stat: '100%', label: 'Your leads' },
            ].map(({ stat, label }) => (
              <div key={label} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 900, color: C.blueXL, letterSpacing: '-0.02em' }}>{stat}</div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="how-it-works" style={{ maxWidth: 1140, margin: '0 auto', padding: '96px 32px' }}>
        <div style={{ textAlign: 'center', marginBottom: 56 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.blueXL, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 12 }}>
            How It Works
          </div>
          <h2 style={{ fontSize: 38, fontWeight: 900, color: C.text, margin: '0 0 16px', letterSpacing: '-0.025em', lineHeight: 1.15 }}>
            From scan to closed deal
          </h2>
          <p style={{ fontSize: 16, color: C.sub, maxWidth: 500, margin: '0 auto', lineHeight: 1.65 }}>
            Set up once. Capture leads forever.
          </p>
        </div>

        <div className="steps-grid" style={{ display: 'flex', gap: 20 }}>
          {[
            {
              emoji: '📱', step: '01',
              title: 'Place Your QR Sign',
              body: 'Print once, reuse forever. Assign to any listing in seconds from your dashboard. No new signs, no reprinting.',
            },
            {
              emoji: '🔔', step: '02',
              title: 'Buyer Scans → You Get Alerted',
              body: 'Instant text the moment a buyer submits their info. Name, phone, email — straight to you. No delays, no middlemen.',
            },
            {
              emoji: '🔥', step: '03',
              title: 'Know Who\'s Ready to Buy',
              body: 'Behavior-based scoring tells you exactly which buyer to call first. Not just a list — intelligence.',
            },
          ].map(({ emoji, step, title, body }, i) => (
            <div key={step} style={{ flex: 1, position: 'relative' }}>
              {i < 2 && (
                <div style={{
                  position: 'absolute', top: 24, left: 'calc(100% + 10px)',
                  width: 0, fontSize: 20, color: C.border, zIndex: 1,
                  display: 'none',
                }} />
              )}
              <div style={{
                background: C.navy2, border: `1px solid ${C.border}`,
                borderRadius: 20, padding: '32px 28px', height: '100%',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                    background: `${C.blue}25`, border: `1px solid ${C.blue}40`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
                  }}>{emoji}</div>
                  <span style={{ fontSize: 12, fontWeight: 800, color: C.blue, letterSpacing: '0.06em' }}>STEP {step}</span>
                </div>
                <div style={{ fontSize: 19, fontWeight: 800, color: C.text, margin: '0 0 12px', letterSpacing: '-0.01em', lineHeight: 1.25 }}>{title}</div>
                <div style={{ fontSize: 14.5, color: C.sub, lineHeight: 1.7 }}>{body}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section id="features" style={{ background: C.navy3, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: 1140, margin: '0 auto', padding: '96px 32px' }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.blueXL, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 12 }}>
              Features
            </div>
            <h2 style={{ fontSize: 38, fontWeight: 900, color: C.text, margin: '0 0 16px', letterSpacing: '-0.025em', lineHeight: 1.15 }}>
              Everything you need to win more listings
            </h2>
          </div>

          <div className="feat-grid" style={{ display: 'flex', gap: 20 }}>
            <FeatureCard
              icon="🎯"
              title="Lead Inbox"
              body="See every lead ranked by intent. Hot buyers at the top. Cold ones at the bottom. Know who to call today — not tomorrow."
            />
            <FeatureCard
              icon="📊"
              title="Seller Reports"
              body="Walk into every listing appointment with real buyer data. '42 leads, 6 hot buyers, 3 showing requests.' Sellers love it. You win the listing."
            />
            <FeatureCard
              icon="📍"
              title="QR Sign Intelligence"
              body="Know which signs generate the most buyers. Place smarter. Stop guessing. Win more listings with data your competitors don't have."
            />
          </div>
        </div>
      </section>

      {/* ── POSITIONING STATEMENT ── */}
      <section style={{
        background: `linear-gradient(135deg, ${C.blueBg} 0%, #0F172A 60%)`,
        borderBottom: `1px solid ${C.border}`,
        padding: '96px 32px',
        textAlign: 'center',
      }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <p style={{
            fontSize: 15, fontWeight: 700, color: C.muted,
            textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 24,
          }}>
            The difference
          </p>
          <div style={{ marginBottom: 12 }}>
            <span style={{ fontSize: 28, fontWeight: 700, color: C.sub, letterSpacing: '-0.02em', lineHeight: 1.3 }}>
              A normal QR code gives you{' '}
            </span>
            <span style={{ fontSize: 28, fontWeight: 700, color: C.muted, letterSpacing: '-0.02em', lineHeight: 1.3, textDecoration: 'line-through' }}>
              clicks.
            </span>
          </div>
          <div style={{ marginBottom: 36 }}>
            <span style={{ fontSize: 44, fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1.15 }}>
              theQRealtor gives you{' '}
            </span>
            <span style={{
              fontSize: 44, fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1.15,
              background: `linear-gradient(135deg, ${C.blueXL}, #fff)`,
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>
              leads.
            </span>
          </div>
          <p style={{ fontSize: 18, color: C.sub, lineHeight: 1.65, maxWidth: 500, margin: '0 auto' }}>
            Every lead belongs to <strong style={{ color: C.text }}>you</strong> — not your broker, not a third-party portal. Yours.
          </p>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section id="pricing" style={{ maxWidth: 1140, margin: '0 auto', padding: '96px 32px' }}>
        <div style={{ textAlign: 'center', marginBottom: 56 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.blueXL, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 12 }}>
            Pricing
          </div>
          <h2 style={{ fontSize: 38, fontWeight: 900, color: C.text, margin: '0 0 16px', letterSpacing: '-0.025em', lineHeight: 1.15 }}>
            Simple. No surprises.
          </h2>
          <p style={{ fontSize: 16, color: C.sub, maxWidth: 420, margin: '0 auto', lineHeight: 1.65 }}>
            One plan. Everything included. Cancel anytime.
          </p>
        </div>

        <div style={{ maxWidth: 480, margin: '0 auto' }}>
          <div className="price-card" style={{
            background: C.navy2, border: `2px solid ${C.blue}`,
            borderRadius: 24, padding: '40px 36px',
            boxShadow: `0 0 80px ${C.blue}20`,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.blueXL, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Pro Plan</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  <span style={{ fontSize: 48, fontWeight: 900, color: C.text, letterSpacing: '-0.03em' }}>$29</span>
                  <span style={{ fontSize: 16, color: C.muted }}>/mo</span>
                </div>
                <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>or $249/yr <span style={{ color: C.green, fontWeight: 700 }}>— save 28%</span></div>
              </div>
              <div style={{
                background: `${C.blue}25`, border: `1px solid ${C.blue}40`,
                borderRadius: 10, padding: '6px 12px',
                fontSize: 12, fontWeight: 700, color: C.blueXL,
              }}>
                Most Popular
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 32 }}>
              {[
                'Unlimited properties',
                'Unlimited QR codes',
                'Instant SMS alerts',
                'Lead Intent Scoring',
                'Seller Reports',
                'Sign Studio',
                'CSV export',
              ].map(f => (
                <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 20, height: 20, borderRadius: '50%', background: `${C.blue}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ fontSize: 11, color: C.blueXL, fontWeight: 800 }}>✓</span>
                  </div>
                  <span style={{ fontSize: 15, color: C.sub }}>{f}</span>
                </div>
              ))}
            </div>

            <Link href="/auth" style={{
              display: 'block', textAlign: 'center',
              background: C.blue, color: '#fff',
              fontSize: 16, fontWeight: 800,
              padding: '15px', borderRadius: 12,
              textDecoration: 'none', letterSpacing: '-0.01em',
              boxShadow: `0 4px 24px ${C.blue}50`,
            }}>
              Start Free Trial →
            </Link>
            <p style={{ fontSize: 12, color: C.muted, textAlign: 'center', marginTop: 12, marginBottom: 0 }}>
              No credit card required to start
            </p>
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section style={{ background: C.navy3, borderTop: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '96px 32px' }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.blueXL, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 12 }}>
              FAQ
            </div>
            <h2 style={{ fontSize: 38, fontWeight: 900, color: C.text, margin: 0, letterSpacing: '-0.025em', lineHeight: 1.15 }}>
              Questions, answered
            </h2>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {[
              {
                q: 'Do buyers need to download an app?',
                a: 'No. Buyers scan the QR code and see the property page instantly in their browser. No app download, no friction. Just tap and see.',
              },
              {
                q: 'Who owns the leads?',
                a: 'You do — 100%. Every lead goes directly to you. Never shared with your broker, Zillow, or anyone else. Your QR code, your leads.',
              },
              {
                q: 'How is this different from a regular QR code?',
                a: 'A regular QR code gives you anonymous clicks with no way to follow up. theQRealtor captures names, phone numbers, emails, and scores buyer intent so you know exactly who to call and when.',
              },
              {
                q: 'Does it work with my existing signs?',
                a: 'Yes. Print the QR and attach it to any yard sign, flyer, or door hanger. One QR code can be reassigned to different listings forever — no reprinting needed.',
              },
            ].map(({ q, a }) => (
              <details key={q} style={{ borderBottom: `1px solid ${C.border}` }}>
                <summary className="faq-item" style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '22px 24px', userSelect: 'none',
                }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: C.text, letterSpacing: '-0.01em', paddingRight: 16 }}>{q}</span>
                  <span className="faq-arrow" style={{ color: C.muted, fontSize: 18, flexShrink: 0 }}>⌄</span>
                </summary>
                <div style={{ padding: '0 24px 22px', fontSize: 15, color: C.sub, lineHeight: 1.75 }}>
                  {a}
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ borderTop: `1px solid ${C.border}`, background: C.navy }}>
        <div style={{ maxWidth: 1140, margin: '0 auto', padding: '48px 32px 36px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 32, marginBottom: 40 }}>
            {/* Brand */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
                <Image src="/logo-icon.png" alt="theQRealtor" width={28} height={28} style={{ borderRadius: 6 }} />
                <span style={{ fontSize: 15, fontWeight: 800, color: C.text, letterSpacing: '-0.02em' }}>
                  the<span style={{ color: C.blueL }}>QR</span>ealtor.
                </span>
              </div>
              <p style={{ fontSize: 13, color: C.muted, margin: 0, maxWidth: 220, lineHeight: 1.6 }}>
                Scan · Capture · Convert
              </p>
            </div>

            {/* Links */}
            <div style={{ display: 'flex', gap: 40, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Product</span>
                <a href="#features" style={{ fontSize: 13, color: C.sub, textDecoration: 'none' }}>Features</a>
                <a href="#pricing" style={{ fontSize: 13, color: C.sub, textDecoration: 'none' }}>Pricing</a>
                <Link href="/auth" style={{ fontSize: 13, color: C.sub, textDecoration: 'none' }}>Sign In</Link>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Legal</span>
                <Link href="/privacy" style={{ fontSize: 13, color: C.sub, textDecoration: 'none' }}>Privacy Policy</Link>
                <Link href="/terms" style={{ fontSize: 13, color: C.sub, textDecoration: 'none' }}>Terms of Service</Link>
                <Link href="/sms-consent" style={{ fontSize: 13, color: C.sub, textDecoration: 'none' }}>SMS Consent</Link>
                <a href="mailto:support@theqrealtor.com" style={{ fontSize: 13, color: C.sub, textDecoration: 'none' }}>Support</a>
              </div>
            </div>
          </div>

          <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <span style={{ fontSize: 12, color: C.muted }}>© 2026 theQRealtor. All rights reserved.</span>
            <span style={{ fontSize: 12, color: C.muted }}>Built for real estate agents who close.</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
