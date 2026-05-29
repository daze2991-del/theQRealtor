import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'theQRealtor — QR Lead Capture for Real Estate Agents',
  description: 'Capture more buyer leads from every listing. Convert sign scans into qualified leads with instant agent notifications — no apps, no paper forms.',
}

/* ─── tokens ─────────────────────────────────────────────────── */
const C = {
  bg:      '#0F0F13',
  bg2:     '#13131A',
  card:    '#1A1A24',
  border:  '#252533',
  purple:  '#7C3AED',
  purpleL: '#8B5CF6',
  purpleD: '#6D28D9',
  text:    '#F0F2F5',
  muted:   '#6B7280',
  muted2:  '#9CA3AF',
} as const

/* ─── shared components ──────────────────────────────────────── */
function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ textAlign: 'center', marginBottom: 12 }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: C.purpleL, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
        {children}
      </span>
    </div>
  )
}

function Check({ dim }: { dim?: boolean }) {
  return <span style={{ color: dim ? C.muted : C.purpleL, flexShrink: 0, fontWeight: 700 }}>✓</span>
}

/* ─── hero visual ────────────────────────────────────────────── */
function HeroVisual() {
  const leads = [
    { name: 'Sarah M.', tag: 'Ready to offer',      color: '#F87171', bg: '#3B0D0D' },
    { name: 'James K.', tag: 'Actively searching',  color: '#FB923C', bg: '#3B1F0D' },
    { name: 'Priya L.', tag: 'Casually looking',    color: '#60A5FA', bg: '#1E3A5F' },
  ]
  return (
    <div style={{ position: 'relative', width: 320, flexShrink: 0 }}>
      <div style={{
        background: C.card, border: `1px solid ${C.border}`,
        borderRadius: 20, padding: 24,
        boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>123 Oak Street</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>Austin, TX</div>
          </div>
          <div style={{ background: '#052e16', border: '1px solid #16a34a', borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 700, color: '#4ade80' }}>
            Active
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18 }}>
          <div style={{ background: `${C.purple}18`, border: `1px solid ${C.purple}35`, borderRadius: 12, padding: '12px 14px', textAlign: 'center' }}>
            <div style={{ fontSize: 26, fontWeight: 800, color: C.purpleL, lineHeight: 1 }}>47</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>Scans this week</div>
          </div>
          <div style={{ background: '#1A1A0D', border: '1px solid #3A3A1E', borderRadius: 12, padding: '12px 14px', textAlign: 'center' }}>
            <div style={{ fontSize: 26, fontWeight: 800, color: '#FFD700', lineHeight: 1 }}>12</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>Leads captured</div>
          </div>
        </div>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
          Recent Leads
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {leads.map(({ name, tag, color, bg }) => (
            <div key={name} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 10px', background: '#0F0F13', borderRadius: 10,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 24, height: 24, borderRadius: 7, background: `${C.purple}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: C.purpleL }}>
                  {name.slice(0, 2).toUpperCase()}
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{name}</span>
              </div>
              <span style={{ fontSize: 10, fontWeight: 700, color, background: bg, borderRadius: 6, padding: '2px 7px' }}>{tag}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Floating SMS alert */}
      <div style={{
        position: 'absolute', bottom: -28, right: -24,
        background: C.bg, border: `1px solid ${C.purple}`,
        borderRadius: 14, padding: '12px 16px',
        boxShadow: `0 8px 40px rgba(124,58,237,0.25)`,
        maxWidth: 200,
      }}>
        <div style={{ fontSize: 10, color: C.purpleL, fontWeight: 700, marginBottom: 5, letterSpacing: '0.06em' }}>
          ⚡ SMS ALERT SENT
        </div>
        <div style={{ fontSize: 12, color: C.text, lineHeight: 1.4 }}>
          "New lead: Sarah M. is ready to make an offer on Oak St."
        </div>
      </div>
    </div>
  )
}

/* ─── page ───────────────────────────────────────────────────── */
export default function HomePage() {
  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        .lp-nav {
          position: sticky; top: 0; z-index: 100;
          background: rgba(15,15,19,0.85);
          backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
          border-bottom: 1px solid #252533;
          height: 64px; padding: 0 32px;
          display: flex; align-items: center; justify-content: space-between;
        }

        .lp-hero {
          padding: 104px 32px 96px;
          background: radial-gradient(ellipse 90% 60% at 50% -10%, #7C3AED1C 0%, transparent 65%), #0F0F13;
        }

        .lp-hero-inner {
          max-width: 1120px; margin: 0 auto;
          display: flex; align-items: center; gap: 72px;
        }

        .lp-h1 {
          font-size: clamp(38px, 5.5vw, 68px);
          font-weight: 900; line-height: 1.06; letter-spacing: -0.03em; color: #F0F2F5;
        }

        .lp-section { padding: 96px 32px; }

        .lp-h2 {
          font-size: clamp(28px, 3.5vw, 44px);
          font-weight: 900; color: #F0F2F5;
          text-align: center; letter-spacing: -0.025em; line-height: 1.15; margin-top: 8px;
        }

        .steps-grid  { display: grid; grid-template-columns: repeat(3,1fr); gap: 24px; margin-top: 56px; }
        .features-grid { display: grid; grid-template-columns: repeat(2,1fr); gap: 20px; margin-top: 56px; }
        .scan-steps-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 20px; margin-top: 56px; }
        .pricing-grid  { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; max-width: 840px; margin: 56px auto 0; }

        .feature-card {
          background: #1A1A24; border: 1px solid #252533;
          border-radius: 16px; padding: 28px;
          transition: border-color 0.2s, transform 0.2s;
        }
        .feature-card:hover { border-color: #7C3AED55; transform: translateY(-3px); }

        .comparison-table {
          width: 100%; border-collapse: collapse; margin-top: 48px;
          font-size: 15px;
        }
        .comparison-table th {
          padding: 14px 18px; text-align: left;
          font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em;
          color: #6B7280; border-bottom: 1px solid #252533;
        }
        .comparison-table th:not(:first-child) { text-align: center; }
        .comparison-table td {
          padding: 14px 18px; border-bottom: 1px solid #1C1C28; color: #9CA3AF;
        }
        .comparison-table td:not(:first-child) { text-align: center; font-size: 18px; }
        .comparison-table td:last-child { color: #F0F2F5; font-weight: 700; }
        .comparison-table th:last-child { color: #8B5CF6; }
        .comparison-table tr:last-child td { border-bottom: none; }
        .comparison-table tbody tr:hover td { background: rgba(255,255,255,0.02); }

        .btn-primary {
          display: inline-block;
          background: #7C3AED; color: #fff;
          font-weight: 800; font-size: 16px;
          padding: 14px 32px; border-radius: 10px; text-decoration: none;
          box-shadow: 0 0 36px #7C3AED44; transition: opacity 0.15s;
        }
        .btn-primary:hover { opacity: 0.9; }

        .btn-ghost {
          display: inline-block;
          background: transparent; color: #F0F2F5;
          font-weight: 600; font-size: 16px;
          padding: 14px 24px; border-radius: 10px;
          text-decoration: none; border: 1px solid #252533;
          transition: border-color 0.15s;
        }
        .btn-ghost:hover { border-color: #374151; }

        @media (max-width: 900px) {
          .steps-grid, .scan-steps-grid { grid-template-columns: 1fr 1fr; }
          .lp-hero-inner { gap: 40px; }
        }
        @media (max-width: 700px) {
          .lp-hero { padding: 72px 20px 88px; }
          .lp-hero-inner { flex-direction: column; gap: 60px; }
          .lp-hero-visual { order: -1; width: 100%; max-width: 320px; margin: 0 auto; }
          .steps-grid, .features-grid, .scan-steps-grid, .pricing-grid { grid-template-columns: 1fr; }
          .lp-nav { padding: 0 20px; }
          .lp-section { padding: 72px 20px; }
          .nav-signin { display: none; }
          .comparison-table { font-size: 13px; }
          .comparison-table th, .comparison-table td { padding: 10px 10px; }
        }
      `}</style>

      {/* ── Nav ── */}
      <nav className="lp-nav">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'sans-serif' }}>
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M14 4L3 13h3v10h6v-6h4v6h6V13h3L14 4z" fill="#7C3AED"/>
            </svg>
          <span style={{ fontWeight: 800, fontSize: 26, letterSpacing: '-0.02em', color: '#FFFFFF' }}>the<span style={{ color: '#7C3AED' }}>QR</span>ealtor.</span>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', fontFamily: 'sans-serif' }}>
          <Link href="/auth" className="nav-signin" style={{ color: C.muted, fontSize: 14, fontWeight: 600, textDecoration: 'none', padding: '8px 14px' }}>
            Sign in
          </Link>
          <Link href="/auth" style={{ background: C.purple, color: '#fff', fontSize: 14, fontWeight: 700, textDecoration: 'none', padding: '9px 20px', borderRadius: 8 }}>
            Get started free
          </Link>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="lp-hero">
        <div className="lp-hero-inner" style={{ fontFamily: 'sans-serif' }}>
          <div style={{ flex: '1 1 440px' }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: `${C.purple}15`, border: `1px solid ${C.purple}40`,
              borderRadius: 100, padding: '6px 16px', marginBottom: 28,
            }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: C.purpleL, display: 'inline-block', flexShrink: 0 }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: C.purpleL }}>Built for real estate agents</span>
            </div>

            <h1 className="lp-h1">
              Capture More<br />
              <span style={{ color: C.purpleL }}>Buyer Leads</span><br />
              From Every Listing
            </h1>

            <p style={{ fontSize: 18, color: C.muted2, lineHeight: 1.65, marginTop: 24, maxWidth: 500 }}>
              Capture every buyer who stops at your listing. theQRealtor converts sign scans into qualified leads with instant agent notifications — no apps, no paper forms.
            </p>

            <div style={{ display: 'flex', gap: 12, marginTop: 36, flexWrap: 'wrap' }}>
              <Link href="/auth" className="btn-primary">Start Your Free Trial</Link>
              <a href="#how-it-works" className="btn-ghost">See how it works →</a>
            </div>

            <div style={{ display: 'flex', gap: 24, marginTop: 28, flexWrap: 'wrap' }}>
              {['14-day free trial', 'Setup in 2 minutes', 'No credit card required'].map(t => (
                <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: C.muted }}>
                  <span style={{ color: C.purpleL, fontSize: 12, fontWeight: 700 }}>✓</span> {t}
                </div>
              ))}
            </div>
          </div>

          <div className="lp-hero-visual"><HeroVisual /></div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section id="how-it-works" className="lp-section" style={{ background: C.bg2, fontFamily: 'sans-serif' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto' }}>
          <Eyebrow>How it works</Eyebrow>
          <h2 className="lp-h2">Up and running in three steps</h2>
          <div className="steps-grid">
            {([
              { n: '01', icon: '📌', title: 'Deploy Your QR Sign',        body: "Generate a property-specific QR code and place it on any sign, rider, or flyer. No special hardware required." },
              { n: '02', icon: '📱', title: 'Buyers Self-Identify',        body: "Prospects scan with their phone camera and complete a branded lead form — name, contact, and purchase timeline. Zero friction." },
              { n: '03', icon: '⚡', title: 'Receive Instant Lead Alerts', body: "The moment a buyer submits, you receive an SMS with their contact details and motivation level. Respond while intent is highest." },
            ] as const).map(({ n, icon, title, body }) => (
              <div key={n} style={{
                background: C.card, border: `1px solid ${C.border}`,
                borderRadius: 18, padding: 30, position: 'relative', overflow: 'hidden',
              }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#2A2A3A', position: 'absolute', top: 20, right: 22, letterSpacing: '0.05em' }}>
                  {n}
                </div>
                <div style={{ fontSize: 36, marginBottom: 18, lineHeight: 1 }}>{icon}</div>
                <h3 style={{ fontSize: 18, fontWeight: 800, color: C.text, marginBottom: 12, lineHeight: 1.2 }}>{title}</h3>
                <p style={{ fontSize: 14, color: C.muted2, lineHeight: 1.65 }}>{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── What Happens After the Scan? ── */}
      <section className="lp-section" style={{ background: C.bg, fontFamily: 'sans-serif' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto' }}>
          <Eyebrow>The buyer journey</Eyebrow>
          <h2 className="lp-h2">What Happens After the Scan?</h2>
          <div className="scan-steps-grid">
            {([
              { n: '1', icon: '📷', title: 'Buyer scans QR code',           body: 'From the yard sign, door hanger, or flyer — using any phone camera, no app required.' },
              { n: '2', icon: '🏠', title: 'Buyer views property preview',  body: 'A mobile-optimized page shows key details and teases the full listing to build interest.' },
              { n: '3', icon: '📝', title: 'Buyer submits contact info',     body: 'Name, phone, email, and purchase timeline — unlocks the full gallery and listing details.' },
              { n: '4', icon: '💬', title: 'Agent gets instant text',        body: 'You receive an SMS with the lead\'s contact info and buying timeline the moment they submit.' },
              { n: '5', icon: '📊', title: 'Lead appears in dashboard',      body: 'Every lead is logged, time-stamped, and sorted by motivation level in your dashboard.' },
              { n: '6', icon: '🤝', title: 'Agent follows up immediately',   body: 'Reach out while the buyer is still standing in front of the property — when interest is highest.' },
            ] as const).map(({ n, icon, title, body }) => (
              <div key={n} style={{
                background: C.card, border: `1px solid ${C.border}`,
                borderRadius: 16, padding: 26, position: 'relative', overflow: 'hidden',
              }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#2A2A3A', position: 'absolute', top: 18, right: 18, letterSpacing: '0.05em' }}>
                  {n}
                </div>
                <div style={{ fontSize: 30, marginBottom: 14, lineHeight: 1 }}>{icon}</div>
                <h3 style={{ fontSize: 16, fontWeight: 800, color: C.text, marginBottom: 8, lineHeight: 1.25 }}>{title}</h3>
                <p style={{ fontSize: 13, color: C.muted2, lineHeight: 1.6 }}>{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="lp-section" style={{ background: C.bg2, fontFamily: 'sans-serif' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto' }}>
          <Eyebrow>Why it works</Eyebrow>
          <h2 className="lp-h2">Built around how buyers actually behave</h2>
          <div className="features-grid">
            {([
              { icon: '🏡', title: 'Never lose a drive-by buyer',              body: 'Most buyers who slow down at a sign never call. A QR code captures them in the moment — before they move on to the next listing.' },
              { icon: '📱', title: 'Get text alerts the moment a buyer shows interest', body: 'Know instantly when someone scans your sign and submits their info. Strike while interest is at its peak.' },
              { icon: '📊', title: 'Know which listings generate the most interest', body: 'See scan volume, lead conversion, and buyer motivation for every property — so you can focus on what\'s working.' },
              { icon: '💰', title: 'One extra closing pays for years of service',  body: 'At $19/mo, a single buyer lead that converts to a transaction covers your subscription many times over.' },
            ] as const).map(({ icon, title, body }) => (
              <div key={title} className="feature-card">
                <div style={{ fontSize: 36, marginBottom: 16, lineHeight: 1 }}>{icon}</div>
                <h3 style={{ fontSize: 18, fontWeight: 800, color: C.text, marginBottom: 10, lineHeight: 1.2 }}>{title}</h3>
                <p style={{ fontSize: 14, color: C.muted2, lineHeight: 1.65 }}>{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── ROI ── */}
      <section className="lp-section" style={{ background: C.bg, fontFamily: 'sans-serif' }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <div style={{
            background: `linear-gradient(135deg, ${C.purple}12, #1A0D2E)`,
            border: `1px solid ${C.purple}35`,
            borderRadius: 24, padding: '52px 48px', textAlign: 'center',
          }}>
            <Eyebrow>The math is simple</Eyebrow>
            <h2 style={{ fontSize: 'clamp(26px,3.5vw,38px)', fontWeight: 900, color: C.text, letterSpacing: '-0.025em', lineHeight: 1.15, marginTop: 8, marginBottom: 32 }}>
              One Lead Can Change Everything
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20, marginBottom: 36 }}>
              {([
                { label: 'Avg. buyer commission', value: '$8,000+' },
                { label: 'theQRealtor Pro', value: '$19/mo' },
                { label: 'Break-even leads', value: '1' },
              ] as const).map(({ label, value }) => (
                <div key={label} style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, borderRadius: 14, padding: '20px 16px' }}>
                  <div style={{ fontSize: 28, fontWeight: 900, color: C.purpleL, lineHeight: 1, marginBottom: 8 }}>{value}</div>
                  <div style={{ fontSize: 12, color: C.muted2, lineHeight: 1.4 }}>{label}</div>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 16, color: C.muted2, lineHeight: 1.65, maxWidth: 460, margin: '0 auto 32px' }}>
              One buyer lead that closes covers your subscription for years. Every additional lead is pure upside.
            </p>
            <Link href="/auth" className="btn-primary">Start Your Free Trial</Link>
          </div>
        </div>
      </section>

      {/* ── Why theQRealtor? ── */}
      <section className="lp-section" style={{ background: C.bg2, fontFamily: 'sans-serif' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <Eyebrow>Comparison</Eyebrow>
          <h2 className="lp-h2">Why theQRealtor?</h2>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 18, overflow: 'hidden', marginTop: 48 }}>
            <table className="comparison-table">
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
                  <th style={{ width: '34%' }}>Feature</th>
                  <th>Paper Sign-In</th>
                  <th>Generic QR Code</th>
                  <th style={{ color: C.purpleL }}>theQRealtor</th>
                </tr>
              </thead>
              <tbody>
                {([
                  ['Captures buyer leads',  '❌', '⚠️', '✅'],
                  ['Instant SMS alert',     '❌', '❌', '✅'],
                  ['Scan analytics',        '❌', '❌', '✅'],
                  ['Lead qualification',    '❌', '❌', '✅'],
                  ['Reusable QR signs',     '❌', '❌', '✅'],
                  ['Works with any phone',  '✅', '✅', '✅'],
                ] as const).map(([feature, a, b, c]) => (
                  <tr key={feature}>
                    <td style={{ color: C.text, fontWeight: 600 }}>{feature}</td>
                    <td>{a}</td>
                    <td>{b}</td>
                    <td>{c}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" className="lp-section" style={{ background: C.bg, fontFamily: 'sans-serif' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto' }}>
          <Eyebrow>Pricing</Eyebrow>
          <h2 className="lp-h2">Simple, transparent pricing</h2>
          <p style={{ textAlign: 'center', color: C.muted2, marginTop: 14, fontSize: 16 }}>
            Start free. Upgrade when your pipeline demands it.
          </p>
          <div className="pricing-grid">
            {/* Starter */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 22, padding: '36px 32px' }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16 }}>Starter</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 6 }}>
                <span style={{ fontSize: 48, fontWeight: 900, color: C.text, lineHeight: 1 }}>$0</span>
              </div>
              <div style={{ fontSize: 14, color: C.muted, marginBottom: 28 }}>Free for 14 days, then $9/mo</div>
              <Link href="/auth" style={{
                display: 'block', textAlign: 'center',
                background: 'transparent', border: `1px solid ${C.border}`,
                color: C.text, fontWeight: 700, fontSize: 15,
                padding: '13px 24px', borderRadius: 10, textDecoration: 'none', marginBottom: 28,
              }}>
                Start Free Trial
              </Link>
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 13 }}>
                {['1 active property', 'Unlimited QR codes', 'Lead capture forms', 'Scan & lead tracking', 'Analytics dashboard'].map(f => (
                  <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: C.muted2 }}>
                    <Check dim /> {f}
                  </li>
                ))}
                {['SMS alerts', 'Priority support'].map(f => (
                  <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: '#374151' }}>
                    <span style={{ color: '#374151' }}>—</span> {f}
                  </li>
                ))}
              </ul>
            </div>

            {/* Pro */}
            <div style={{
              background: C.card, border: `1px solid ${C.purple}`,
              borderRadius: 22, padding: '36px 32px',
              boxShadow: `0 0 48px ${C.purple}1A`,
              position: 'relative', overflow: 'hidden',
            }}>
              <div style={{
                position: 'absolute', top: 18, right: 18,
                background: C.purple, color: '#fff', fontSize: 11, fontWeight: 800,
                padding: '4px 12px', borderRadius: 20, letterSpacing: '0.06em',
              }}>
                MOST POPULAR
              </div>
              <div style={{ fontSize: 12, fontWeight: 800, color: C.purpleL, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16 }}>Pro</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 6 }}>
                <span style={{ fontSize: 48, fontWeight: 900, color: C.text, lineHeight: 1 }}>$19</span>
                <span style={{ fontSize: 18, color: C.muted }}>/mo</span>
              </div>
              <div style={{ fontSize: 14, color: C.muted, marginBottom: 28 }}>
                Or <span style={{ color: C.text, fontWeight: 700 }}>$159/yr</span> — save $69
              </div>
              <Link href="/auth" style={{
                display: 'block', textAlign: 'center',
                background: C.purple, color: '#fff', fontWeight: 800, fontSize: 15,
                padding: '13px 24px', borderRadius: 10, textDecoration: 'none', marginBottom: 28,
                boxShadow: `0 4px 24px ${C.purple}44`,
              }}>
                Start free trial
              </Link>
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 13 }}>
                {[
                  'Unlimited properties', 'Unlimited QR codes', 'Lead capture forms',
                  'Scan & lead tracking', 'Analytics dashboard', 'Instant SMS lead alerts',
                  'Motivation scoring', 'CSV export', 'Priority support',
                ].map(f => (
                  <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: C.text }}>
                    <Check /> {f}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="lp-section" style={{ background: C.bg2, fontFamily: 'sans-serif' }}>
        <div style={{ maxWidth: 680, margin: '0 auto', textAlign: 'center' }}>
          <div style={{
            background: `linear-gradient(135deg, ${C.purple}0F, #1A0D2E)`,
            border: `1px solid ${C.purple}28`, borderRadius: 28, padding: '72px 48px',
          }}>
            <h2 style={{ fontSize: 'clamp(28px,4vw,40px)', fontWeight: 900, color: C.text, marginBottom: 18, letterSpacing: '-0.025em', lineHeight: 1.15 }}>
              Stop Losing Buyers at the Sign.
            </h2>
            <p style={{ fontSize: 17, color: C.muted2, marginBottom: 36, lineHeight: 1.65, maxWidth: 460, margin: '0 auto 36px' }}>
              theQRealtor captures leads the moment interest peaks. Set up your first property in minutes.
            </p>
            <Link href="/auth" className="btn-primary" style={{ fontSize: 17, padding: '16px 44px' }}>
              Create Your Free Account
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer style={{ background: '#0A0A0D', borderTop: `1px solid ${C.border}`, padding: '36px 32px', fontFamily: 'sans-serif' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M14 4L3 13h3v10h6v-6h4v6h6V13h3L14 4z" fill="#7C3AED"/>
            </svg>
            <span style={{ fontWeight: 800, fontSize: 26, letterSpacing: '-0.02em', color: '#FFFFFF' }}>the<span style={{ color: '#7C3AED' }}>QR</span>ealtor.</span>
          </div>
          <div style={{ display: 'flex', gap: 28 }}>
            {[['Sign in', '/auth'], ['Get started', '/auth'], ['Pricing', '#pricing']].map(([label, href]) => (
              <Link key={label} href={href} style={{ fontSize: 13, color: C.muted, textDecoration: 'none' }}>{label}</Link>
            ))}
          </div>
          <p style={{ fontSize: 13, color: '#374151' }}>© 2026 RealtQR. All rights reserved.</p>
        </div>
      </footer>
    </>
  )
}
