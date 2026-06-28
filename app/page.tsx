import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import NavHamburger from '../components/NavHamburger'

export const metadata: Metadata = {
  title: 'theQRealtor — Yard Sign Scans → Instant Buyer Leads',
  description: 'Turn every yard sign scan into a captured buyer lead. Instant SMS alerts, intent scoring, and seller reports — built for real estate agents.',
}

const C = {
  bg:      '#0B0F1A',
  card:    '#141824',
  card2:   '#0F1221',
  purple:  '#7C3AED',
  purpleL: '#8B5CF6',
  purpleXL:'#A78BFA',
  purpleBg:'#2E1065',
  text:    '#F8FAFC',
  sub:     '#C4C4D4',
  muted:   '#6B7280',
  border:  '#252533',
  hot:     '#EF4444',
  hotBg:   '#450A0A',
  green:   '#22C55E',
} as const

/* ─── QR code SVG ─────────────────────────────────────────── */
function QRSvg() {
  const S = 6
  const finder = (ox: number, oy: number, key: string) => (
    <g key={key}>
      <rect x={ox} y={oy} width={7*S} height={7*S} fill="black"/>
      <rect x={ox+S} y={oy+S} width={5*S} height={5*S} fill="white"/>
      <rect x={ox+2*S} y={oy+2*S} width={3*S} height={3*S} fill="black"/>
    </g>
  )
  const dm: [number,number][] = [
    [8,13],[8,15],[8,17],[8,19],[8,20],
    [9,9],[9,10],[9,12],[9,14],[9,16],[9,18],[9,20],
    [10,8],[10,11],[10,14],[10,15],[10,17],[10,19],[10,20],
    [11,9],[11,11],[11,13],[11,15],[11,17],[11,18],[11,20],
    [12,8],[12,10],[12,12],[12,14],[12,16],[12,19],
    [13,9],[13,12],[13,14],[13,16],[13,18],[13,20],
    [14,8],[14,10],[14,11],[14,13],[14,15],[14,17],[14,20],
    [15,9],[15,11],[15,14],[15,16],[15,18],[15,19],
    [16,8],[16,10],[16,12],[16,15],[16,17],[16,20],
    [17,9],[17,11],[17,13],[17,16],[17,18],[17,20],
    [18,8],[18,10],[18,12],[18,14],[18,17],[18,19],
    [19,9],[19,11],[19,13],[19,15],[19,16],[19,18],[19,20],
    [20,8],[20,10],[20,12],[20,14],[20,15],[20,17],[20,19],
  ]
  return (
    <svg width={21*S} height={21*S} viewBox={`0 0 ${21*S} ${21*S}`} style={{ display: 'block' }}>
      <rect width={21*S} height={21*S} fill="white"/>
      {finder(0, 0, 'tl')}
      {finder(14*S, 0, 'tr')}
      {finder(0, 14*S, 'bl')}
      {[8,10,12].map(n => <rect key={`th${n}`} x={n*S} y={6*S} width={S} height={S} fill="black"/>)}
      {[8,10,12].map(n => <rect key={`tv${n}`} x={6*S} y={n*S} width={S} height={S} fill="black"/>)}
      <rect x={8*S} y={8*S} width={S} height={S} fill="black"/>
      {dm.map(([r,c]) => <rect key={`d${r}-${c}`} x={c*S} y={r*S} width={S} height={S} fill="black"/>)}
    </svg>
  )
}

/* ─── A-frame open house sign ─────────────────────────────── */
function AFrameSign() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 256, userSelect: 'none' }}>
      {/* Sign face */}
      <div style={{
        width: '100%',
        background: 'linear-gradient(160deg, #1A0D2E 0%, #2E1065 100%)',
        border: '2px solid rgba(124,58,237,0.55)',
        borderRadius: '12px 12px 6px 6px',
        padding: '18px 20px 16px',
        boxShadow: '0 28px 72px rgba(124,58,237,0.28), inset 0 0 0 1px rgba(139,92,246,0.12)',
        position: 'relative',
        zIndex: 1,
      }}>
        {/* OPEN HOUSE banner */}
        <div style={{
          background: C.purple, borderRadius: 6,
          textAlign: 'center', padding: '7px 0', marginBottom: 14,
          letterSpacing: '0.13em', fontSize: 11, fontWeight: 900, color: '#fff',
        }}>OPEN HOUSE</div>

        {/* QR code */}
        <div style={{
          background: '#fff', borderRadius: 8, padding: 8,
          textAlign: 'center', marginBottom: 14,
        }}>
          <QRSvg />
        </div>

        {/* Scan for list */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 9, fontWeight: 800, color: C.purpleL, letterSpacing: '0.11em', textTransform: 'uppercase' as const, marginBottom: 7 }}>
            Scan for:
          </div>
          {[
            ['📸', 'Photos'],
            ['💰', 'Price & details'],
            ['📅', 'Open house times'],
            ['💬', 'Contact agent'],
          ].map(([icon, text]) => (
            <div key={text} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: '#D8B4FE', marginBottom: 5, lineHeight: 1.2 }}>
              <span style={{ fontSize: 11, flexShrink: 0 }}>{icon}</span>
              <span>{text}</span>
            </div>
          ))}
        </div>

        {/* Branding */}
        <div style={{ borderTop: '1px solid rgba(139,92,246,0.22)', paddingTop: 9, textAlign: 'center' as const }}>
          <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.05em', color: C.muted }}>
            Powered by <span style={{ color: C.purpleL }}>theQRealtor</span>
          </span>
        </div>
      </div>

      {/* A-frame legs */}
      <div style={{ position: 'relative', width: '100%', height: 54, flexShrink: 0 }}>
        <div style={{ position: 'absolute', top: 4, left: 26, width: 3, height: 50, background: 'rgba(124,58,237,0.42)', borderRadius: 2, transform: 'rotate(-10deg)', transformOrigin: 'top center' }} />
        <div style={{ position: 'absolute', top: 4, right: 26, width: 3, height: 50, background: 'rgba(124,58,237,0.42)', borderRadius: 2, transform: 'rotate(10deg)', transformOrigin: 'top center' }} />
        <div style={{ position: 'absolute', bottom: 8, left: 20, right: 20, height: 2, background: 'rgba(124,58,237,0.28)', borderRadius: 1 }} />
      </div>
    </div>
  )
}

/* ─── feature card ────────────────────────────────────────── */
function FeatureCard({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`,
      borderRadius: 14, padding: '24px 22px',
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <div style={{ fontSize: 28 }}>{icon}</div>
      <div style={{ fontSize: 16, fontWeight: 800, color: C.text, letterSpacing: '-0.01em', lineHeight: 1.25 }}>{title}</div>
      <div style={{ fontSize: 14, color: C.sub, lineHeight: 1.7 }}>{body}</div>
    </div>
  )
}

/* ─── page ────────────────────────────────────────────────── */
export default function LandingPage() {
  return (
    <div style={{ background: C.bg, minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', color: C.text, overflowX: 'hidden' }}>
      <style>{`
        * { box-sizing: border-box; }
        html, body { overflow-x: hidden; max-width: 100%; }
        .nav-hamburger { display: none !important; }
        @media (max-width: 768px) {
          .hero-grid    { flex-direction: column !important; }
          .hero-visual  { display: none !important; }
          .steps-grid   { flex-direction: column !important; }
          .feat-grid    { flex-direction: column !important; }
          .proof-grid   { flex-wrap: wrap !important; }
          .hero-h1      { font-size: 36px !important; }
          .hero-btns    { flex-direction: column !important; align-items: stretch !important; }
          .faq-item     { padding: 16px 18px !important; }
          .price-card   { padding: 28px 22px !important; }
          .buyer-grid   { grid-template-columns: repeat(2, 1fr) !important; }
          .cmp-grid     { flex-direction: column !important; }
          .seller-stats { display: grid !important; grid-template-columns: repeat(2, 1fr) !important; gap: 10px !important; }
        }
        @media (max-width: 640px) {
          .nav-links     { display: none !important; }
          .nav-hamburger { display: flex !important; }
          .nav-cta       { display: none !important; }
          .site-nav      { padding-left: 16px !important; padding-right: 16px !important; }
          .nav-logo-text { font-size: 22px !important; }
          .hero-h1       { font-size: 30px !important; }
          .hero-section  { padding-left: 20px !important; padding-right: 20px !important; }
          .steps-grid    { gap: 10px !important; }
        }
        details summary { cursor: pointer; list-style: none; }
        details summary::-webkit-details-marker { display: none; }
        details[open] .faq-arrow { transform: rotate(180deg); }
        .faq-arrow { transition: transform 0.2s; display: inline-block; }
        a { transition: opacity 0.15s; }
        a:hover { opacity: 0.8; }
      `}</style>

      {/* ── NAVBAR ── */}
      <nav className="site-nav" style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'rgba(11,15,26,0.92)', backdropFilter: 'blur(16px)',
        borderBottom: `1px solid ${C.border}`,
        padding: '0 32px', height: 64,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        maxWidth: '100%',
      }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none', flexShrink: 0, background: 'transparent' }}>
          <div className="nav-logo-text" style={{ display: 'flex', alignItems: 'center', fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em' }}>
            <span style={{ color: '#fff' }}>the</span>
            <span style={{ color: C.purpleL }}>QR</span>
            <span style={{ color: '#fff' }}>ealtor.</span>
          </div>
        </Link>

        <div className="nav-links" style={{ display: 'flex', gap: 32, alignItems: 'center' }}>
          <a href="#features" style={{ fontSize: 14, color: C.sub, textDecoration: 'none', fontWeight: 500 }}>Features</a>
          <a href="#pricing" style={{ fontSize: 14, color: C.sub, textDecoration: 'none', fontWeight: 500 }}>Beta Agents</a>
          <Link href="/auth" style={{ fontSize: 14, color: C.sub, textDecoration: 'none', fontWeight: 500 }}>Sign In</Link>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <NavHamburger />
          <Link href="/auth?tab=signup" className="nav-cta" style={{
            background: C.purple, color: '#fff',
            fontSize: 13, fontWeight: 700,
            padding: '9px 20px', borderRadius: 10,
            textDecoration: 'none', flexShrink: 0,
            letterSpacing: '-0.01em',
          }}>
            Apply for Access
          </Link>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className="hero-section" style={{ maxWidth: 1140, margin: '0 auto', padding: '72px 32px 64px' }}>
        <div className="hero-grid" style={{ display: 'flex', alignItems: 'center', gap: 56, justifyContent: 'space-between' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: `${C.purple}22`, border: `1px solid ${C.purple}40`,
              borderRadius: 100, padding: '5px 14px 5px 10px', marginBottom: 28,
            }}>
              <span style={{ fontSize: 14 }}>🏠</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.purpleXL, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Scan · Capture · Convert
              </span>
            </div>

            <h1 className="hero-h1" style={{ fontSize: 52, fontWeight: 900, color: C.text, margin: '0 0 22px', lineHeight: 1.1, letterSpacing: '-0.03em' }}>
              Prove Your Marketing to Sellers.{' '}
              <span style={{ background: `linear-gradient(135deg, ${C.purpleL}, ${C.purple})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                Capture Every Buyer Lead.
              </span>
            </h1>

            <p style={{ fontSize: 22, fontWeight: 700, color: C.text, lineHeight: 1.45, margin: '0 0 14px', maxWidth: 520, letterSpacing: '-0.01em' }}>
              Show sellers exactly how your marketing is performing.
            </p>
            <p style={{ fontSize: 18, color: C.sub, lineHeight: 1.7, margin: '0 0 36px', maxWidth: 520 }}>
              See every buyer interested in your listing. Walk into every listing appointment with proof.
            </p>

            <div className="hero-btns" style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
              <Link href="/auth?tab=signup" style={{
                background: C.purple, color: '#fff',
                fontSize: 16, fontWeight: 800,
                padding: '14px 28px', borderRadius: 12,
                textDecoration: 'none', letterSpacing: '-0.01em',
                boxShadow: `0 4px 24px ${C.purple}60`,
              }}>
                Apply for Beta Access →
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
              {['✓ No credit card required', '✓ 90 days free', '✓ Limited to 10 agents'].map((item, i) => (
                <span key={i} style={{ fontSize: 13, color: C.muted }}>
                  <span style={{ color: C.purpleL, fontWeight: 700 }}>{item.slice(0, 1)}</span>{item.slice(1)}{i < 2 ? <span style={{ color: C.border, margin: '0 6px' }}>·</span> : null}
                </span>
              ))}
            </div>
          </div>

          {/* Right — A-frame sign */}
          <div className="hero-visual" style={{ display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
            <AFrameSign />
          </div>
        </div>
      </section>

      {/* ── SELLER REPORTS HIGHLIGHT ── */}
      <section style={{ background: C.card2, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '72px 32px', textAlign: 'center' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.purpleL, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 12 }}>
            Seller Reports
          </div>
          <h2 style={{ fontSize: 36, fontWeight: 900, color: C.text, margin: '0 0 14px', letterSpacing: '-0.025em', lineHeight: 1.15 }}>
            Win More Listings With Real Data
          </h2>
          <p style={{ fontSize: 16, color: C.sub, margin: '0 0 44px', lineHeight: 1.65 }}>
            Walk into every listing appointment with proof of buyer demand.
          </p>

          <div style={{
            background: C.card, border: `1px solid ${C.border}`,
            borderRadius: 14, padding: '24px 28px',
            maxWidth: 620, margin: '0 auto 20px',
            boxShadow: `0 0 60px ${C.purple}10`,
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 18 }}>
              123 Main St — This Month
            </div>
            <div className="seller-stats" style={{ display: 'flex', gap: 10, justifyContent: 'center', marginBottom: 10 }}>
              {[
                { v: '217', label: 'Scans',            color: C.purpleL, bg: `${C.purple}18` },
                { v: '42',  label: 'Buyer Leads',      color: '#FCD34D', bg: '#2D200A' },
                { v: '18',  label: 'Buyer Interest 🔥', color: C.hot,    bg: '#300808' },
                { v: '7',   label: 'Showing Requests', color: C.green,   bg: '#0A2010' },
              ].map(({ v, label, color, bg }) => (
                <div key={label} style={{ flex: 1, background: bg, borderRadius: 10, padding: '14px 8px', minWidth: 72 }}>
                  <div style={{ fontSize: 26, fontWeight: 900, color, lineHeight: 1, letterSpacing: '-0.02em' }}>{v}</div>
                  <div style={{ fontSize: 9.5, color: C.muted, marginTop: 5, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, lineHeight: 1.4 }}>{label}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, color: C.muted, textAlign: 'center', marginBottom: 18, fontStyle: 'italic' }}>
              Sample data shown for illustration purposes only.
            </div>
            <div style={{ background: '#052E16', border: '1px solid #166534', borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 14 }}>🟢</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#4ADE80' }}>Active Buyer Engagement</div>
                <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>This listing is generating strong engagement based on real buyer activity from your listing.</div>
              </div>
            </div>
          </div>

          <p style={{ fontSize: 15, color: C.sub, margin: '0 0 24px', lineHeight: 1.65 }}>
            Share this with your seller in one click. No extra work.
          </p>
          <Link href="/auth?tab=signup" style={{
            display: 'inline-block', background: C.purple, color: '#fff',
            fontSize: 15, fontWeight: 700, padding: '12px 28px', borderRadius: 10,
            textDecoration: 'none', boxShadow: `0 4px 20px ${C.purple}45`,
          }}>
            Apply for Beta Access →
          </Link>
        </div>
      </section>

      {/* ── WHY BUYERS SCAN ── */}
      <section style={{ maxWidth: 1140, margin: '0 auto', padding: '72px 32px' }}>
        <div style={{ textAlign: 'center', marginBottom: 44 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.purpleL, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 12 }}>
            The Scan Experience
          </div>
          <h2 style={{ fontSize: 36, fontWeight: 900, color: C.text, margin: '0 0 14px', letterSpacing: '-0.025em', lineHeight: 1.15 }}>
            Give Buyers a Reason to Scan
          </h2>
          <p style={{ fontSize: 16, color: C.sub, maxWidth: 460, margin: '0 auto', lineHeight: 1.65 }}>
            Buyers scan because they get instant value — no app required.
          </p>
        </div>

        <div className="buyer-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 28 }}>
          {[
            { icon: '📸', title: 'Instant property photos',         body: 'Full photo gallery loads immediately in their browser.' },
            { icon: '💰', title: 'Price and listing details',       body: 'Beds, baths, price, and key features — all on one page.' },
            { icon: '📅', title: 'Open house times',                body: 'Upcoming open house dates and times shown clearly.' },
            { icon: '🏠', title: 'Property features & description', body: 'The full story of the home, written to sell.' },
            { icon: '📋', title: 'Request a private showing',       body: 'One tap to schedule a showing directly with the agent.' },
            { icon: '💬', title: 'Ask the agent a question',        body: 'Direct line to the listing agent — no middleman.' },
          ].map(({ icon, title, body }) => (
            <div key={title} style={{
              background: C.card, border: `1px solid ${C.border}`,
              borderRadius: 12, padding: '20px 18px',
              display: 'flex', flexDirection: 'column', gap: 8,
            }}>
              <div style={{ fontSize: 24 }}>{icon}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text, letterSpacing: '-0.01em', lineHeight: 1.3 }}>{title}</div>
              <div style={{ fontSize: 13, color: C.sub, lineHeight: 1.65 }}>{body}</div>
            </div>
          ))}
        </div>

        <div style={{ textAlign: 'center', padding: '18px 22px', background: `${C.purple}14`, border: `1px solid ${C.purple}28`, borderRadius: 12 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: C.text }}>
            Buyer gets information.{' '}
            <span style={{ color: C.purpleL }}>You get the lead.</span>
            {' '}Every time.
          </span>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="how-it-works" style={{ maxWidth: 1140, margin: '0 auto', padding: '72px 32px' }}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.purpleL, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 12 }}>
            How It Works
          </div>
          <h2 style={{ fontSize: 36, fontWeight: 900, color: C.text, margin: '0 0 14px', letterSpacing: '-0.025em', lineHeight: 1.15 }}>
            From scan to closed deal
          </h2>
          <p style={{ fontSize: 16, color: C.sub, maxWidth: 500, margin: '0 auto', lineHeight: 1.65 }}>
            Set up once. Capture leads forever.
          </p>
        </div>

        <div className="steps-grid" style={{ display: 'flex', gap: 16 }}>
          {[
            { emoji: '📱', step: '01', title: 'Buyer Scans Your Sign',                    body: 'Buyer sees instant property info — photos, price, details, open house times — right in their browser. No app needed.' },
            { emoji: '📋', step: '02', title: 'Buyer Requests Showing or Asks a Question', body: 'To connect with the agent, the buyer submits their contact info voluntarily. Name, phone, email — all captured.' },
            { emoji: '🔔', step: '03', title: 'You Get Alerted Instantly',                body: 'The moment a buyer submits, you get a text with their name, phone, email, and buyer intent score. No delays.' },
            { emoji: '🔥', step: '04', title: 'Know Who to Call First',                   body: 'Your Lead Inbox ranks every buyer by engagement. Buyers with the most interest at the top. Call the right person at the right time.' },
          ].map(({ emoji, step, title, body }) => (
            <div key={step} style={{ flex: 1 }}>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '24px 20px', height: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                    background: `${C.purple}20`, border: `1px solid ${C.purple}38`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
                  }}>{emoji}</div>
                  <span style={{ fontSize: 11, fontWeight: 800, color: C.purpleL, letterSpacing: '0.06em' }}>STEP {step}</span>
                </div>
                <div style={{ fontSize: 16, fontWeight: 800, color: C.text, margin: '0 0 8px', letterSpacing: '-0.01em', lineHeight: 1.25 }}>{title}</div>
                <div style={{ fontSize: 13.5, color: C.sub, lineHeight: 1.7 }}>{body}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section id="features" style={{ background: C.card2, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: 1140, margin: '0 auto', padding: '72px 32px' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.purpleL, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 12 }}>
              Features
            </div>
            <h2 style={{ fontSize: 36, fontWeight: 900, color: C.text, margin: '0 0 16px', letterSpacing: '-0.025em', lineHeight: 1.15 }}>
              Everything you need to win more listings
            </h2>
          </div>
          <div className="feat-grid" style={{ display: 'flex', gap: 16 }}>
            <FeatureCard icon="🎯" title="Lead Inbox"          body="See every lead ranked by intent. Buyers with the most interest at the top. Cold ones at the bottom. Know who to call today — not tomorrow." />
            <FeatureCard icon="📊" title="Seller Reports"      body="Walk into every listing appointment with real buyer data. '42 leads, 6 high-interest buyers, 3 showing requests.' Sellers love it. You win the listing." />
            <FeatureCard icon="📍" title="QR Sign Intelligence" body="Know which signs generate the most buyers. Place smarter. Stop guessing. Win more listings with data your competitors don't have." />
          </div>
        </div>
      </section>

      {/* ── WHY AGENTS PAY ── */}
      <section style={{ background: C.card2, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: 800, margin: '0 auto', padding: '72px 32px', textAlign: 'center' }}>
          <h2 style={{ fontSize: 40, fontWeight: 900, color: C.text, margin: '0 0 22px', letterSpacing: '-0.03em', lineHeight: 1.15 }}>
            Win More Listings
          </h2>
          <p style={{ fontSize: 19, color: C.sub, lineHeight: 1.7, margin: 0 }}>
            Show homeowners exactly how many buyers viewed, engaged with, and requested information about their property. That&apos;s what keeps agents subscribed month after month.
          </p>
        </div>
      </section>

      {/* ── COMPARISON TABLE ── */}
      <section style={{ maxWidth: 1140, margin: '0 auto', padding: '72px 32px' }}>
        <div style={{ textAlign: 'center', marginBottom: 44 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.purpleL, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 12 }}>
            The Difference
          </div>
          <h2 style={{ fontSize: 36, fontWeight: 900, color: C.text, margin: '0 0 16px', letterSpacing: '-0.025em', lineHeight: 1.15 }}>
            Why Not Just Use a Free QR Code?
          </h2>
        </div>

        <div className="cmp-grid" style={{ display: 'flex', gap: 14, maxWidth: 820, margin: '0 auto' }}>
          <div style={{ flex: 1, background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '24px 24px', opacity: 0.7 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: C.muted, marginBottom: 20, paddingBottom: 14, borderBottom: `1px solid ${C.border}` }}>
              Free QR Code
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {['Sends to a website', 'No buyer info captured', 'No alerts', 'No analytics', 'No follow-up possible'].map(item => (
                <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 14, color: '#EF4444', flexShrink: 0, fontWeight: 700 }}>✗</span>
                  <span style={{ fontSize: 14, color: C.muted }}>{item}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ flex: 1, background: `${C.purple}10`, border: `2px solid ${C.purple}50`, borderRadius: 14, padding: '24px 24px' }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: C.purpleL, marginBottom: 20, paddingBottom: 14, borderBottom: `1px solid ${C.purple}28`, display: 'flex', alignItems: 'center', gap: 8 }}>
              theQRealtor
              <span style={{ fontSize: 11, fontWeight: 700, background: C.purple, color: '#fff', borderRadius: 5, padding: '2px 7px' }}>✓</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {['Captures name, phone, email', 'Instant SMS alert to agent', 'Buyer intent scoring', 'Seller reports included', 'Lead inbox with action prompts'].map(item => (
                <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 14, color: C.purpleL, flexShrink: 0, fontWeight: 700 }}>✓</span>
                  <span style={{ fontSize: 14, color: C.sub }}>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── BETA AGENT PROGRAM ── */}
      <section id="pricing" style={{ maxWidth: 820, margin: '0 auto', padding: '72px 32px' }}>
        <div style={{ textAlign: 'center', marginBottom: 44 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.purpleL, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 12 }}>
            Early Access
          </div>
          <h2 style={{ fontSize: 36, fontWeight: 900, color: C.text, margin: '0 0 16px', letterSpacing: '-0.025em', lineHeight: 1.15 }}>
            Beta Agent Program
          </h2>
          <p style={{ fontSize: 16, color: C.sub, maxWidth: 560, margin: '0 auto', lineHeight: 1.65 }}>
            Limited to the first 10 qualified agents. Help shape the future of theQRealtor during our free beta testing period.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px 28px', maxWidth: 560, margin: '0 auto 36px', textAlign: 'left' }}>
          {[
            '✓ Capture every buyer who scans your sign',
            '✓ Know which buyers are most interested',
            '✓ Generate leads automatically',
            '✓ Know who to call first',
          ].map(b => (
            <div key={b} style={{ fontSize: 14, color: C.sub, fontWeight: 500 }}>{b}</div>
          ))}
        </div>

        <div className="price-card" style={{
          background: C.card, border: `2px solid ${C.purple}50`,
          borderRadius: 16, padding: '36px 36px',
          boxShadow: `0 0 80px ${C.purple}10`,
          maxWidth: 680, margin: '0 auto',
        }}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: '#F97316' }}>Limited beta — 10 agents</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 28 }}>
            {[
              { icon: '🚀', text: 'Free full platform access during the beta — no charge' },
              { icon: '📱', text: 'Up to 10 QR codes' },
              { icon: '💳', text: 'No credit card required' },
              { icon: '💬', text: 'Direct access to the founder — your feedback shapes the product' },
              { icon: '⏱️', text: '60–90 day testing period' },
            ].map(({ icon, text }) => (
              <div key={text} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 7, flexShrink: 0,
                  background: `${C.purple}18`, border: `1px solid ${C.purple}30`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, marginTop: 1,
                }}>{icon}</div>
                <span style={{ fontSize: 14, color: C.sub, lineHeight: 1.65 }}>{text}</span>
              </div>
            ))}
          </div>

          <div style={{ background: `${C.purple}10`, border: `1px solid ${C.purple}25`, borderRadius: 10, padding: '16px 18px', marginBottom: 28 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: C.purpleL, marginBottom: 6 }}>Why 90 days?</div>
            <p style={{ fontSize: 13.5, color: C.sub, margin: 0, lineHeight: 1.75 }}>
              Real estate listings and buyer activity vary by season. 90 days gives agents enough time to place QR codes, collect scans, generate leads, and build the habit across multiple listings.
            </p>
          </div>

          <Link href="/auth?tab=signup" style={{
            display: 'block', textAlign: 'center',
            background: C.purple, color: '#fff',
            fontSize: 16, fontWeight: 800,
            padding: '15px', borderRadius: 10,
            textDecoration: 'none', letterSpacing: '-0.01em',
            boxShadow: `0 4px 24px ${C.purple}45`,
          }}>
            Apply for Beta Access →
          </Link>
          <p style={{ fontSize: 13, color: C.muted, textAlign: 'center', marginTop: 12, marginBottom: 0, lineHeight: 1.6 }}>
            Limited enrollment while we work directly with agents during beta.
          </p>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section style={{ background: C.card2, borderTop: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '72px 32px' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.purpleL, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 12 }}>
              FAQ
            </div>
            <h2 style={{ fontSize: 36, fontWeight: 900, color: C.text, margin: 0, letterSpacing: '-0.025em', lineHeight: 1.15 }}>
              Questions, answered
            </h2>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {[
              { q: 'Do buyers need to download an app?',       a: 'No. Buyers scan the QR code and see the property page instantly in their browser. No app download, no friction. Just tap and see.' },
              { q: 'Where do my leads go?',                    a: "Straight into your private theQRealtor dashboard. Only you can see the leads from your listings. We don't sell, resell, or share your buyer data with portals, lead-resale services, or any third party — unlike other lead portals, we never monetize your leads or sell them back to you. theQRealtor delivers leads to your account and nowhere else." },
              { q: 'How is this different from a regular QR code?', a: 'A regular QR code gives you anonymous clicks with no way to follow up. theQRealtor captures names, phone numbers, emails, and scores buyer intent so you know exactly who to call and when.' },
              { q: 'Does it work with my existing signs?',     a: 'Yes. Print the QR and attach it to any yard sign, flyer, or door hanger. One QR code can be reassigned to different listings forever — no reprinting needed.' },
            ].map(({ q, a }) => (
              <details key={q} style={{ borderBottom: `1px solid ${C.border}` }}>
                <summary className="faq-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 22px', userSelect: 'none' }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: C.text, letterSpacing: '-0.01em', paddingRight: 16 }}>{q}</span>
                  <span className="faq-arrow" style={{ color: C.muted, fontSize: 18, flexShrink: 0 }}>⌄</span>
                </summary>
                <div style={{ padding: '0 22px 20px', fontSize: 14.5, color: C.sub, lineHeight: 1.75 }}>{a}</div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ borderTop: `1px solid ${C.border}`, background: C.bg }}>
        <div style={{ maxWidth: 1140, margin: '0 auto', padding: '44px 32px 32px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 32, marginBottom: 36 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
                <Image src="/logo-icon.png" alt="theQRealtor" width={28} height={28} style={{ borderRadius: 6 }} />
                <span style={{ fontSize: 15, fontWeight: 800, color: C.text, letterSpacing: '-0.02em' }}>
                  the<span style={{ color: C.purpleL }}>QR</span>ealtor.
                </span>
              </div>
              <p style={{ fontSize: 13, color: C.muted, margin: 0, maxWidth: 220, lineHeight: 1.6 }}>
                Scan · Capture · Convert
              </p>
            </div>

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

          <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 22, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <span style={{ fontSize: 12, color: C.muted }}>© 2026 theQRealtor. All rights reserved.</span>
            <span style={{ fontSize: 12, color: C.muted }}>Built for real estate agents who close.</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
