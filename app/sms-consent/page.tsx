import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'SMS Opt-In Consent — theQRealtor',
  description: 'How real estate agents opt in to receive SMS lead alerts from theQRealtor. Provided for carrier and campaign registry verification.',
}

const L = {
  bg:       '#F8FAFC',
  card:     '#FFFFFF',
  border:   '#E2E8F0',
  text:     '#0F172A',
  sub:      '#334155',
  muted:    '#64748B',
  purple:   '#7C3AED',
  purpleL:  '#8B5CF6',
  purpleBg: '#F5F3FF',
  green:    '#16A34A',
  greenBg:  '#F0FDF4',
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', marginBottom: 20 }}>
      <div style={{
        width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
        background: L.purple, color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 14, fontWeight: 800,
      }}>{n}</div>
      <div style={{ fontSize: 15, color: L.sub, lineHeight: 1.65, paddingTop: 5 }}>{children}</div>
    </div>
  )
}

export default function SmsConsentPage() {
  return (
    <div style={{ minHeight: '100vh', background: L.bg, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', color: L.text }}>

      {/* Nav */}
      <nav style={{
        background: L.card, borderBottom: `1px solid ${L.border}`,
        padding: '16px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
          <span style={{ fontSize: 22 }}>🏠</span>
          <span style={{ fontSize: 16, fontWeight: 800, color: L.purple, letterSpacing: '-0.02em' }}>
            theQRealtor
          </span>
        </Link>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <Link href="/terms" style={{ fontSize: 13, color: L.muted, textDecoration: 'none' }}>Terms</Link>
          <Link href="/privacy" style={{ fontSize: 13, color: L.muted, textDecoration: 'none' }}>Privacy</Link>
        </div>
      </nav>

      {/* Content */}
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '56px 24px 96px' }}>

        {/* 1. Header */}
        <div style={{ marginBottom: 48 }}>
          <h1 style={{ fontSize: 34, fontWeight: 900, color: L.text, margin: '0 0 12px', letterSpacing: '-0.02em', lineHeight: 1.15 }}>
            SMS Opt-In Consent — theQRealtor
          </h1>
          <p style={{ fontSize: 17, color: L.sub, margin: '0 0 12px', lineHeight: 1.65, fontWeight: 500 }}>
            How real estate agents opt in to receive SMS lead alerts
          </p>
          <p style={{ fontSize: 13, color: L.muted, margin: 0, lineHeight: 1.5 }}>
            This page is provided for carrier and campaign registry verification purposes.
          </p>
        </div>

        {/* 2. How Opt-In Works */}
        <div style={{ background: L.card, border: `1px solid ${L.border}`, borderRadius: 16, padding: '24px 28px', marginBottom: 28 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: L.text, margin: '0 0 24px' }}>How Opt-In Works</h2>

          <Step n={1}>
            Agent creates a theQRealtor account at{' '}
            <a href="https://theqrealtor.com" style={{ color: L.purple, textDecoration: 'none', fontWeight: 600 }}>theqrealtor.com</a>.
          </Step>

          <Step n={2}>
            Agent navigates to <strong style={{ color: L.text }}>Settings</strong> in their dashboard.
          </Step>

          <Step n={3}>
            Agent enters their mobile phone number in the <strong style={{ color: L.text }}>&ldquo;Phone Number&rdquo;</strong> field.
          </Step>

          <Step n={4}>
            Agent manually enables the <strong style={{ color: L.text }}>&ldquo;SMS Lead Alerts&rdquo;</strong> toggle (disabled by default).
          </Step>

          <Step n={5}>
            Before the toggle activates, the agent is shown the consent language displayed in Section 3 below.
          </Step>

          <Step n={6}>
            Agent must affirmatively enable the toggle to complete opt-in. No SMS is sent without this action.
          </Step>
        </div>

        {/* 3. Consent Language */}
        <div style={{ background: L.card, border: `1px solid ${L.border}`, borderRadius: 16, padding: '24px 28px', marginBottom: 28 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: L.text, margin: '0 0 16px' }}>Consent Language</h2>
          <div style={{ fontSize: 13, fontWeight: 600, color: L.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>
            Consent language shown to users:
          </div>
          <div style={{
            background: L.purpleBg,
            border: `1px solid ${L.purple}40`,
            borderRadius: 10,
            padding: '16px 20px',
            fontSize: 15,
            color: L.sub,
            lineHeight: 1.75,
          }}>
            By enabling SMS Lead Alerts, you agree to receive text message notifications from theQRealtor
            when new buyer leads are captured for your listings. Message frequency varies based on lead
            activity. Msg &amp; Data rates may apply. Reply STOP at any time to opt out. Reply HELP for help.
          </div>
        </div>

        {/* 4. Screenshots */}
        <div style={{ background: L.card, border: `1px solid ${L.border}`, borderRadius: 16, padding: '24px 28px', marginBottom: 28 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: L.text, margin: '0 0 8px' }}>Opt-In Flow Screenshots</h2>
          <p style={{ fontSize: 14, color: L.muted, margin: '0 0 28px', lineHeight: 1.6 }}>
            The following screenshots show the actual opt-in interface within the theQRealtor dashboard.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 24, alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, width: '100%' }}>
              <img src="/images/sms-consent/settings-phone-field.png" alt="Settings page showing SMS Alert Phone Number and toggle" style={{ width: '100%', maxWidth: '700px', borderRadius: '8px', border: '1px solid #333' }} />
              <span style={{ fontSize: 13, color: L.muted, textAlign: 'center' }}>Settings page — phone number field</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, width: '100%' }}>
              <img src="/images/sms-consent/toggle-on.png" alt="SMS Lead Alerts toggle and consent language" style={{ width: '100%', maxWidth: '700px', borderRadius: '8px', border: '1px solid #333' }} />
              <span style={{ fontSize: 13, color: L.muted, textAlign: 'center' }}>SMS Lead Alerts toggle (default: off)</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, width: '100%' }}>
              <img src="/images/sms-consent/full-settings.png" alt="Full settings page" style={{ width: '100%', maxWidth: '700px', borderRadius: '8px', border: '1px solid #333' }} />
              <span style={{ fontSize: 13, color: L.muted, textAlign: 'center' }}>Confirmation state after opt-in enabled</span>
            </div>
          </div>
        </div>

        {/* 5. Sample Message */}
        <div style={{ background: L.card, border: `1px solid ${L.border}`, borderRadius: 16, padding: '24px 28px', marginBottom: 28 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: L.text, margin: '0 0 16px' }}>Example SMS Message</h2>
          <div style={{
            display: 'inline-block',
            background: '#E9E9EB',
            borderRadius: '18px 18px 18px 4px',
            padding: '12px 16px',
            fontSize: 14,
            color: '#1C1C1E',
            lineHeight: 1.65,
            maxWidth: '80%',
          }}>
            theQRealtor Alert: New buyer lead for 123 Main St. Name: Mike Davis | Phone: (310) 555-0789 |
            Email: mike@email.com. Log in to your dashboard to view full lead details.
            Reply STOP to opt out.
          </div>
        </div>

        {/* 6. Opt-Out Instructions */}
        <div style={{ background: L.greenBg, border: `1px solid ${L.green}30`, borderRadius: 16, padding: '24px 28px', marginBottom: 28 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: L.text, margin: '0 0 14px' }}>How to Opt Out</h2>
          <p style={{ fontSize: 15, color: L.sub, lineHeight: 1.75, margin: '0 0 12px' }}>
            Agents can opt out at any time by:
          </p>
          <ul style={{ margin: '0 0 14px', paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 15, color: L.sub, lineHeight: 1.65 }}>
            <li>
              Replying{' '}
              <strong style={{ color: L.text, fontFamily: 'monospace', background: L.card, padding: '2px 6px', borderRadius: 4 }}>STOP</strong>
              {' '}to any SMS message received
            </li>
            <li>
              Navigating to <strong style={{ color: L.text }}>Settings</strong> and disabling the{' '}
              <strong style={{ color: L.text }}>SMS Lead Alerts</strong> toggle
            </li>
          </ul>
          <p style={{ fontSize: 15, color: L.sub, lineHeight: 1.65, margin: 0 }}>
            SMS messages will immediately cease upon opt-out.
          </p>
        </div>

        {/* 7. Footer Links */}
        <div style={{ paddingTop: 24, borderTop: `1px solid ${L.border}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 14, color: L.sub }}>
            Privacy Policy:{' '}
            <a href="https://theqrealtor.com/privacy" style={{ color: L.purple, textDecoration: 'none' }}>
              theqrealtor.com/privacy
            </a>
          </div>
          <div style={{ fontSize: 14, color: L.sub }}>
            Terms of Service:{' '}
            <a href="https://theqrealtor.com/terms" style={{ color: L.purple, textDecoration: 'none' }}>
              theqrealtor.com/terms
            </a>
          </div>
          <div style={{ fontSize: 14, color: L.sub }}>
            For support:{' '}
            <a href="mailto:support@theqrealtor.com" style={{ color: L.purple, textDecoration: 'none' }}>
              support@theqrealtor.com
            </a>
          </div>
        </div>

      </div>
    </div>
  )
}
